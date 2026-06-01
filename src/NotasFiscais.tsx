import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser } from "./lib/api";
import { emitirToast } from "./lib/toast";
import { imprimirDanfeNfce } from "./lib/danfeNfce";
import { fmtBRL, fmtData } from "./components/cupons/fmt";

// Tela de histórico de NFC-e (Fase 6). Lista as notas emitidas, permite
// reimprimir o DANFE, consultar status (notas PROCESSANDO), cancelar
// (ADMIN/GERENTE) e baixar o XML. Inutilização de faixa fica num modal.

type NotaItem = {
  id: string;
  serie: number;
  numeroFiscal: number;
  status: string;
  ambiente: string;
  chaveAcesso?: string | null;
  protocolo?: string | null;
  dataAutorizacao?: string | null;
  cStat?: string | null;
  xMotivo?: string | null;
  valorTotal: number | string;
  destCpfCnpj?: string | null;
  destNome?: string | null;
  createdAt: string;
};

const STATUS_COR: Record<string, string> = {
  AUTORIZADA: C.green,
  REJEITADA: C.red,
  CANCELADA: C.muted,
  DENEGADA: C.red,
  INUTILIZADA: C.muted,
  PROCESSANDO: C.yellow,
  PENDENTE: C.yellow,
  CONTINGENCIA: C.yellow,
  ERRO: C.red,
};

const FILTROS = ["", "AUTORIZADA", "REJEITADA", "CANCELADA", "PROCESSANDO", "INUTILIZADA"];

export default function NotasFiscais({ user }: { user: SessionUser }) {
  const [notas, setNotas] = useState<NotaItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("");
  const [acaoEm, setAcaoEm] = useState<string | null>(null);
  const [cancelarAlvo, setCancelarAlvo] = useState<NotaItem | null>(null);
  const [modalInutilizar, setModalInutilizar] = useState(false);

  const podeGerenciar = user.role === "ADMIN" || user.role === "GERENTE";

  const carregar = useCallback(() => {
    setCarregando(true);
    setErro("");
    api.listarNotasFiscais({ status: filtro || undefined, limit: 300 })
      .then((r) => setNotas(r as NotaItem[]))
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  function flashErro(e: unknown) {
    emitirToast({ tipo: "erro", titulo: "Erro", mensagem: (e as Error).message, duracao: 7000 });
  }

  async function reimprimir(n: NotaItem) {
    setAcaoEm(n.id);
    try { await imprimirDanfeNfce(n.id); }
    catch (e) { flashErro(e); }
    finally { setAcaoEm(null); }
  }

  async function consultar(n: NotaItem) {
    setAcaoEm(n.id);
    try {
      const r = await api.consultarNotaFiscal(n.id) as { nota: NotaItem };
      emitirToast({ tipo: "info", titulo: "Status atualizado", mensagem: r.nota?.status || "" });
      carregar();
    } catch (e) { flashErro(e); }
    finally { setAcaoEm(null); }
  }

  async function baixarXml(n: NotaItem) {
    setAcaoEm(n.id);
    try {
      const full = await api.obterNotaFiscal(n.id, true) as { xmlAutorizado?: string | null };
      if (!full.xmlAutorizado) {
        emitirToast({ tipo: "aviso", titulo: "Sem XML", mensagem: "Esta nota ainda nao tem XML autorizado." });
        return;
      }
      const blob = new Blob([full.xmlAutorizado], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nfce-${n.serie}-${n.numeroFiscal}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { flashErro(e); }
    finally { setAcaoEm(null); }
  }

  return (
    <div>
      {erro && <div style={alerta(C.red)}>{erro}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <label className="text-gp-muted text-[12px] font-semibold">Status:</label>
        <select
          title="Filtrar por status"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          style={selectStyle}
        >
          {FILTROS.map((f) => <option key={f} value={f}>{f || "Todos"}</option>)}
        </select>
        <button onClick={carregar} style={btnGhost}>↻ Atualizar</button>
        <div style={{ flex: 1 }} />
        {podeGerenciar && (
          <button onClick={() => setModalInutilizar(true)} style={btnGhost}>
            🚫 Inutilizar numeração
          </button>
        )}
      </div>

      {carregando ? (
        <div className="text-gp-muted text-center p-[30px]">Carregando…</div>
      ) : notas.length === 0 ? (
        <div className="text-gp-muted text-center p-[30px]">Nenhuma NFC-e encontrada.</div>
      ) : (
        <div className="bg-gp-card border border-gp-border rounded-xl overflow-hidden">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.surface, color: C.muted, textAlign: "left" }}>
                <th style={th}>Nº / Série</th>
                <th style={th}>Data</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: "right" }}>Valor</th>
                <th style={th}>Consumidor</th>
                <th style={{ ...th, textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {notas.map((n) => {
                const ocupado = acaoEm === n.id;
                return (
                  <tr key={n.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td}>
                      <b>{n.numeroFiscal}</b> <span className="text-gp-muted">/ {n.serie}</span>
                      {n.ambiente === "HOMOLOGACAO" && (
                        <div style={{ fontSize: 9, color: C.yellow }}>HOMOLOGAÇÃO</div>
                      )}
                    </td>
                    <td style={td}>{fmtData(n.createdAt)}</td>
                    <td style={td}>
                      <span style={badge(STATUS_COR[n.status] || C.muted)}>{n.status}</span>
                      {n.status === "REJEITADA" && n.xMotivo && (
                        <div style={{ fontSize: 10, color: C.red, maxWidth: 240 }}>{n.xMotivo}</div>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(n.valorTotal)}</td>
                    <td style={td}>{n.destCpfCnpj || <span className="text-gp-muted">—</span>}</td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      {n.status === "AUTORIZADA" && (
                        <>
                          <button disabled={ocupado} onClick={() => reimprimir(n)} style={btnMini} title="Reimprimir DANFE">🖨️</button>
                          <button disabled={ocupado} onClick={() => baixarXml(n)} style={btnMini} title="Baixar XML">⬇️</button>
                          {podeGerenciar && (
                            <button disabled={ocupado} onClick={() => setCancelarAlvo(n)} style={btnMiniPerigo} title="Cancelar NFC-e">✕</button>
                          )}
                        </>
                      )}
                      {(n.status === "PROCESSANDO" || n.status === "PENDENTE") && (
                        <button disabled={ocupado} onClick={() => consultar(n)} style={btnMini} title="Consultar status">🔄</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {cancelarAlvo && (
        <ModalCancelar
          nota={cancelarAlvo}
          onFechar={() => setCancelarAlvo(null)}
          onCancelado={() => { setCancelarAlvo(null); carregar(); }}
        />
      )}
      {modalInutilizar && (
        <ModalInutilizar onFechar={() => setModalInutilizar(false)} onConcluido={() => { setModalInutilizar(false); carregar(); }} />
      )}
    </div>
  );
}

function ModalCancelar({ nota, onFechar, onCancelado }: { nota: NotaItem; onFechar: () => void; onCancelado: () => void }) {
  const [justificativa, setJustificativa] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function confirmar() {
    if (justificativa.trim().length < 15) { setErro("A justificativa precisa ter ao menos 15 caracteres."); return; }
    setSalvando(true); setErro("");
    try {
      await api.cancelarNotaFiscal(nota.id, justificativa.trim());
      emitirToast({ tipo: "sucesso", titulo: "NFC-e cancelada", mensagem: `Nota ${nota.numeroFiscal} cancelada.` });
      onCancelado();
    } catch (e) {
      setErro((e as Error).message);
    } finally { setSalvando(false); }
  }

  return (
    <div style={modalBg} onClick={onFechar}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()}>
        <div className="text-gp-white font-bold text-[15px] mb-1">Cancelar NFC-e nº {nota.numeroFiscal}</div>
        <div className="text-gp-muted text-[12px] mb-3">
          O cancelamento é um evento enviado à SEFAZ e sujeito ao prazo legal. Informe a justificativa (15 a 255 caracteres).
        </div>
        {erro && <div style={alerta(C.red)}>{erro}</div>}
        <textarea
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          rows={3}
          placeholder="Motivo do cancelamento"
          style={{ ...inputBase, resize: "vertical", fontFamily: "inherit" }}
        />
        <div className="text-gp-muted text-[10px] mt-1">{justificativa.trim().length}/255</div>
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onFechar} style={btnGhost}>Voltar</button>
          <button onClick={confirmar} disabled={salvando} style={btnPerigo}>
            {salvando ? "Cancelando…" : "Confirmar cancelamento"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalInutilizar({ onFechar, onConcluido }: { onFechar: () => void; onConcluido: () => void }) {
  const [serie, setSerie] = useState("1");
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function confirmar() {
    const s = Number(serie), a = Number(ini), b = Number(fim);
    if (!Number.isInteger(a) || a < 1 || !Number.isInteger(b) || b < a) { setErro("Faixa de números inválida."); return; }
    if (justificativa.trim().length < 15) { setErro("A justificativa precisa ter ao menos 15 caracteres."); return; }
    setSalvando(true); setErro("");
    try {
      const r = await api.inutilizarNumeracaoFiscal({ serie: s, numeroInicial: a, numeroFinal: b, justificativa: justificativa.trim() }) as { inutilizadas: number[] };
      emitirToast({ tipo: "sucesso", titulo: "Numeração inutilizada", mensagem: `${r.inutilizadas?.length || 0} número(s) inutilizado(s).` });
      onConcluido();
    } catch (e) {
      setErro((e as Error).message);
    } finally { setSalvando(false); }
  }

  return (
    <div style={modalBg} onClick={onFechar}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()}>
        <div className="text-gp-white font-bold text-[15px] mb-1">Inutilizar numeração</div>
        <div className="text-gp-muted text-[12px] mb-3">
          Use para "buracos" na sequência (números nunca autorizados). Não cancela notas — apenas comunica à SEFAZ que esses números não serão usados.
        </div>
        {erro && <div style={alerta(C.red)}>{erro}</div>}
        <div className="grid gap-2" style={{ gridTemplateColumns: "0.8fr 1fr 1fr" }}>
          <Campo label="Série"><input title="Série" value={serie} onChange={(e) => setSerie(e.target.value.replace(/\D/g, ""))} style={inputBase} /></Campo>
          <Campo label="Nº inicial"><input title="Numero inicial" value={ini} onChange={(e) => setIni(e.target.value.replace(/\D/g, ""))} style={inputBase} /></Campo>
          <Campo label="Nº final"><input title="Numero final" value={fim} onChange={(e) => setFim(e.target.value.replace(/\D/g, ""))} style={inputBase} /></Campo>
        </div>
        <div className="mt-2">
          <Campo label="Justificativa">
            <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={3} placeholder="Motivo da inutilização" style={{ ...inputBase, resize: "vertical", fontFamily: "inherit" }} />
          </Campo>
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onFechar} style={btnGhost}>Voltar</button>
          <button onClick={confirmar} disabled={salvando} style={btnPerigo}>
            {salvando ? "Enviando…" : "Inutilizar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-gp-muted text-[11px] mb-1 font-semibold">{label}</label>
      {children}
    </div>
  );
}

const th: CSSProperties = { padding: "10px 12px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" };
const td: CSSProperties = { padding: "10px 12px", color: C.text, verticalAlign: "top" };

function badge(cor: string): CSSProperties {
  return { fontSize: 10, padding: "2px 8px", borderRadius: 999, background: cor + "22", color: cor, border: `1px solid ${cor}55`, fontWeight: 700, whiteSpace: "nowrap" };
}
function alerta(cor: string): CSSProperties {
  return { marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: cor + "22", border: `1px solid ${cor}55`, color: cor, fontSize: 13 };
}
const selectStyle: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", color: C.text, fontSize: 13 };
const inputBase: CSSProperties = { width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" };
const btnGhost: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const btnPerigo: CSSProperties = { background: "transparent", border: `1px solid ${C.red}55`, color: C.red, borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnMini: CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", fontSize: 13, cursor: "pointer", marginLeft: 4 };
const btnMiniPerigo: CSSProperties = { ...btnMini, border: `1px solid ${C.red}55`, color: C.red };
const modalBg: CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 };
const modalBox: CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, width: "min(460px, calc(100vw - 32px))" };
