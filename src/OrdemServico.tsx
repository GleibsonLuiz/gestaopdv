// OrdemServico.tsx — Ordem de Serviço (oficina / assistência técnica).
// Lista de OS + modal de criar/editar com itens (peças e serviços) e mudança
// de status. Encaixa no segmento Auto-Peças, mas serve qualquer assistência.

import { useEffect, useState, type CSSProperties } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser } from "./lib/api";

const brl = (n: unknown) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

type StatusOS = "ABERTA" | "EM_ANDAMENTO" | "AGUARDANDO_PECA" | "PRONTA" | "ENTREGUE" | "CANCELADA";

const STATUS_INFO: Record<StatusOS, { label: string; cor: string }> = {
  ABERTA:          { label: "Aberta", cor: "#3b82f6" },
  EM_ANDAMENTO:    { label: "Em andamento", cor: "#f59e0b" },
  AGUARDANDO_PECA: { label: "Aguardando peça", cor: "#a855f7" },
  PRONTA:          { label: "Pronta", cor: "#22c55e" },
  ENTREGUE:        { label: "Entregue", cor: "#64748b" },
  CANCELADA:       { label: "Cancelada", cor: "#ef4444" },
};
const FLUXO: StatusOS[] = ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_PECA", "PRONTA", "ENTREGUE"];

interface ItemOS { tipo: "PECA" | "SERVICO"; descricao: string; quantidade: number; valorUnitario: number; subtotal?: number; }
interface OS {
  id: string; numero: number; status: StatusOS;
  descricaoCliente?: string; telefone?: string; equipamento?: string;
  defeitoRelatado?: string; diagnostico?: string; observacoes?: string;
  previsaoEntrega?: string; desconto: number; total: number;
  valorPecas: number; valorServicos: number;
  cliente?: { id: string; nome: string } | null;
  itens: ItemOS[]; createdAt?: string;
}

export default function OrdemServico({ user }: { user: SessionUser }) {
  const [lista, setLista] = useState<OS[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<OS | null | "nova">(null);

  async function carregar() {
    setCarregando(true); setErro("");
    try {
      const r = await api.osListar({ ...(filtroStatus ? { status: filtroStatus } : {}), ...(busca.trim() ? { busca: busca.trim() } : {}) }) as { ordens: OS[] };
      setLista(r.ordens || []);
    } catch (e) { setErro((e as Error).message || "Erro ao carregar"); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [filtroStatus]);

  const podeGerenciar = user.role === "ADMIN" || user.role === "GERENTE";

  return (
    <div>
      <div className="bg-gp-card border border-gp-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gp-border flex-wrap">
          <div className="text-gp-white text-sm font-bold">🔧 Ordens de Serviço</div>
          <div className="flex gap-2 flex-wrap">
            <input value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === "Enter" && carregar()}
              placeholder="🔍 Nº, cliente, equipamento..." style={{ ...inp, padding: "7px 12px", fontSize: 12, minWidth: 180 }} />
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ ...inp, padding: "7px 10px", fontSize: 12, width: "auto" }}>
              <option value="">Todos status</option>
              {Object.entries(STATUS_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button onClick={() => setEditando("nova")} style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`, color: C.white, border: "none", borderRadius: 8, padding: "7px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ Nova OS</button>
          </div>
        </div>

        {erro && <div className="px-4 py-3 text-gp-red text-sm">{erro}</div>}
        {carregando && lista.length === 0 ? (
          <div className="p-8 text-center text-gp-muted text-sm">Carregando...</div>
        ) : lista.length === 0 ? (
          <div className="p-8 text-center text-gp-muted text-sm">Nenhuma ordem de serviço. Clique em "+ Nova OS" para abrir a primeira.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.surface }}>
                  {["OS", "Cliente / Equipamento", "Status", "Total", "Aberta", ""].map((h, i) => (
                    <th key={i} style={{ padding: "9px 10px", textAlign: i === 3 ? "right" : "left", color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map(os => {
                  const si = STATUS_INFO[os.status];
                  return (
                    <tr key={os.id} style={{ borderBottom: `1px solid ${C.border}55`, cursor: "pointer" }} onClick={() => setEditando(os)}>
                      <td style={{ padding: "9px 10px", color: C.text, fontWeight: 700 }}>#{os.numero}</td>
                      <td style={{ padding: "9px 10px" }}>
                        <div className="text-gp-text font-semibold">{os.cliente?.nome || os.descricaoCliente || "—"}</div>
                        <div className="text-gp-muted text-[10px]">{os.equipamento || ""}</div>
                      </td>
                      <td style={{ padding: "9px 10px" }}>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: si.cor + "33", color: si.cor }}>{si.label}</span>
                      </td>
                      <td style={{ padding: "9px 10px", textAlign: "right", color: C.text, fontWeight: 700 }}>{brl(os.total)}</td>
                      <td style={{ padding: "9px 10px", color: C.muted }}>{fmtData(os.createdAt)}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right" }}><span style={{ color: C.accent, fontSize: 11, fontWeight: 700 }}>Abrir →</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editando && (
        <ModalOS
          os={editando === "nova" ? null : editando}
          podeGerenciar={podeGerenciar}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar(); }}
        />
      )}
    </div>
  );
}

function ModalOS({ os, podeGerenciar, onFechar, onSalvo }: { os: OS | null; podeGerenciar: boolean; onFechar: () => void; onSalvo: () => void }) {
  const ed = os; // null = nova
  const [descricaoCliente, setDescricaoCliente] = useState(ed?.descricaoCliente || ed?.cliente?.nome || "");
  const [telefone, setTelefone] = useState(ed?.telefone || "");
  const [equipamento, setEquipamento] = useState(ed?.equipamento || "");
  const [defeito, setDefeito] = useState(ed?.defeitoRelatado || "");
  const [diagnostico, setDiagnostico] = useState(ed?.diagnostico || "");
  const [observacoes, setObservacoes] = useState(ed?.observacoes || "");
  const [previsao, setPrevisao] = useState(ed?.previsaoEntrega ? ed.previsaoEntrega.slice(0, 10) : "");
  const [desconto, setDesconto] = useState(String(ed?.desconto || ""));
  const [itens, setItens] = useState<ItemOS[]>(ed?.itens?.length ? ed.itens.map(i => ({ ...i })) : []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const bloqueada = ed?.status === "ENTREGUE" || ed?.status === "CANCELADA";

  function setItem(i: number, campo: keyof ItemOS, valor: unknown) {
    setItens(prev => prev.map((it, idx) => idx === i ? { ...it, [campo]: valor } : it));
  }
  function addItem(tipo: "PECA" | "SERVICO") {
    setItens(prev => [...prev, { tipo, descricao: "", quantidade: 1, valorUnitario: 0 }]);
  }
  function rmItem(i: number) { setItens(prev => prev.filter((_, idx) => idx !== i)); }

  const num = (v: unknown) => { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : 0; };
  const valorPecas = itens.filter(i => i.tipo === "PECA").reduce((s, i) => s + num(i.quantidade) * num(i.valorUnitario), 0);
  const valorServicos = itens.filter(i => i.tipo === "SERVICO").reduce((s, i) => s + num(i.quantidade) * num(i.valorUnitario), 0);
  const total = Math.max(0, valorPecas + valorServicos - num(desconto));

  async function salvar() {
    setErro("");
    if (!descricaoCliente.trim() && !equipamento.trim()) { setErro("Informe ao menos o cliente ou o equipamento"); return; }
    setSalvando(true);
    try {
      const payload = {
        descricaoCliente: descricaoCliente.trim() || null, telefone: telefone.trim() || null,
        equipamento: equipamento.trim() || null, defeitoRelatado: defeito.trim() || null,
        diagnostico: diagnostico.trim() || null, observacoes: observacoes.trim() || null,
        previsaoEntrega: previsao || null, desconto: num(desconto),
        itens: itens.map(i => ({ tipo: i.tipo, descricao: i.descricao, quantidade: num(i.quantidade), valorUnitario: num(i.valorUnitario) })),
      };
      if (ed) await api.osAtualizar(ed.id, payload);
      else await api.osCriar(payload);
      onSalvo();
    } catch (e) { setErro((e as Error).message || "Erro ao salvar"); }
    finally { setSalvando(false); }
  }

  async function mudarStatus(s: StatusOS) {
    if (!ed) return;
    setSalvando(true); setErro("");
    try { await api.osMudarStatus(ed.id, s); onSalvo(); }
    catch (e) { setErro((e as Error).message); setSalvando(false); }
  }

  return (
    <div onClick={onFechar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, width: "100%", maxWidth: 720, maxHeight: "92vh", overflow: "auto", padding: 20 }}>
        <div className="flex justify-between items-start gap-3 mb-3">
          <div>
            <div className="text-gp-white text-lg font-extrabold">{ed ? `🔧 OS #${ed.numero}` : "🔧 Nova Ordem de Serviço"}</div>
            {ed && <span style={{ display: "inline-block", marginTop: 4, padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: STATUS_INFO[ed.status].cor + "33", color: STATUS_INFO[ed.status].cor }}>{STATUS_INFO[ed.status].label}</span>}
          </div>
          <button onClick={onFechar} style={{ background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {erro && <div className="px-3 py-2 mb-3 rounded-lg text-gp-red text-xs" style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}>{erro}</div>}

        {/* Mudanca de status (OS existente) */}
        {ed && !bloqueada && (
          <div className="flex gap-2 flex-wrap mb-3">
            {FLUXO.filter(s => s !== ed.status).map(s => (
              <button key={s} onClick={() => mudarStatus(s)} disabled={salvando}
                style={{ background: STATUS_INFO[s].cor + "22", color: STATUS_INFO[s].cor, border: `1px solid ${STATUS_INFO[s].cor}55`, borderRadius: 8, padding: "5px 10px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                → {STATUS_INFO[s].label}
              </button>
            ))}
            <button onClick={() => mudarStatus("CANCELADA")} disabled={salvando}
              style={{ background: C.red + "18", color: C.red, border: `1px solid ${C.red}44`, borderRadius: 8, padding: "5px 10px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Cancelar OS</button>
          </div>
        )}

        {!bloqueada ? (
          <>
            <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Campo label="Cliente"><input value={descricaoCliente} onChange={e => setDescricaoCliente(e.target.value)} style={inp} placeholder="Nome do cliente" /></Campo>
              <Campo label="Telefone"><input value={telefone} onChange={e => setTelefone(e.target.value)} style={inp} /></Campo>
            </div>
            <Campo label="Equipamento / Veículo"><input value={equipamento} onChange={e => setEquipamento(e.target.value)} style={inp} placeholder="Ex: Honda Civic 2018 ABC-1234 / Notebook Dell" /></Campo>
            <Campo label="Defeito relatado"><textarea value={defeito} onChange={e => setDefeito(e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} /></Campo>
            <Campo label="Diagnóstico técnico"><textarea value={diagnostico} onChange={e => setDiagnostico(e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} /></Campo>

            {/* Itens */}
            <div className="flex items-center justify-between mt-2 mb-1">
              <label style={lbl}>Peças e serviços</label>
              <div className="flex gap-2">
                <button onClick={() => addItem("PECA")} style={miniBtn}>+ Peça</button>
                <button onClick={() => addItem("SERVICO")} style={miniBtn}>+ Serviço</button>
              </div>
            </div>
            {itens.length === 0 && <div className="text-gp-muted text-xs mb-2">Nenhum item. Adicione peças e mão de obra.</div>}
            {itens.map((it, i) => (
              <div key={i} className="flex gap-1 items-center mb-1" style={{ flexWrap: "wrap" }}>
                <span style={{ fontSize: 14 }}>{it.tipo === "PECA" ? "🔩" : "🛠️"}</span>
                <input value={it.descricao} onChange={e => setItem(i, "descricao", e.target.value)} placeholder={it.tipo === "PECA" ? "Peça" : "Serviço / mão de obra"} style={{ ...inp, flex: "2 1 160px", padding: "6px 8px", fontSize: 12 }} />
                <input value={it.quantidade} onChange={e => setItem(i, "quantidade", e.target.value)} title="Qtd" style={{ ...inp, width: 56, padding: "6px 6px", fontSize: 12, textAlign: "center" }} />
                <input value={it.valorUnitario} onChange={e => setItem(i, "valorUnitario", e.target.value)} title="Valor unit." placeholder="0,00" style={{ ...inp, width: 80, padding: "6px 8px", fontSize: 12 }} />
                <span className="text-gp-text text-xs font-bold" style={{ minWidth: 70, textAlign: "right" }}>{brl(num(it.quantidade) * num(it.valorUnitario))}</span>
                <button onClick={() => rmItem(i)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            ))}

            <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Campo label="Previsão de entrega"><input type="date" value={previsao} onChange={e => setPrevisao(e.target.value)} style={inp} /></Campo>
              <Campo label="Desconto (R$)"><input value={desconto} onChange={e => setDesconto(e.target.value)} placeholder="0,00" style={inp} /></Campo>
            </div>
            <Campo label="Observações"><textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} /></Campo>

            {/* Totais */}
            <div className="bg-gp-surface border border-gp-border rounded-lg px-3 py-2 mt-2 flex justify-between text-xs">
              <span className="text-gp-muted">Peças {brl(valorPecas)} · Serviços {brl(valorServicos)} · Desc. {brl(num(desconto))}</span>
              <span className="text-gp-white font-extrabold">Total {brl(total)}</span>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={onFechar} style={{ ...btnSec, flex: 1 }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando} style={{ flex: 1, background: C.green, color: C.white, border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", opacity: salvando ? 0.6 : 1 }}>
                {salvando ? "Salvando..." : ed ? "Salvar" : "Abrir OS"}
              </button>
            </div>
          </>
        ) : (
          /* OS bloqueada (entregue/cancelada): so leitura */
          <div className="text-gp-muted text-sm">
            <p>Cliente: <strong className="text-gp-text">{ed?.cliente?.nome || ed?.descricaoCliente || "—"}</strong></p>
            <p>Equipamento: {ed?.equipamento || "—"}</p>
            <p>Total: <strong className="text-gp-text">{brl(ed?.total)}</strong></p>
            <p className="mt-2">Esta OS está {STATUS_INFO[ed!.status].label.toLowerCase()} e não pode ser editada.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 8 }}><label style={lbl}>{label}</label>{children}</div>;
}

const inp: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, outline: "none", width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13 };
const lbl: CSSProperties = { display: "block", color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 };
const btnSec: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "9px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const miniBtn: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, color: C.accent, borderRadius: 6, padding: "4px 10px", fontWeight: 700, fontSize: 11, cursor: "pointer" };
