import { useState, useEffect, useCallback, type CSSProperties, type FormEvent } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser } from "./lib/api";

// ============ HELPERS ============

const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

// ============ TIPOS ============

type TipoMovimento = "GANHO" | "RESGATE" | "AJUSTE";
type AbaId = "config" | "consultar";

interface TipoInfo {
  label: string;
  cor: string;
  icone: string;
}

const TIPO_INFO: Record<TipoMovimento, TipoInfo> = {
  GANHO:   { label: "Ganho",   cor: C.green,  icone: "+" },
  RESGATE: { label: "Resgate", cor: C.accent, icone: "−" },
  AJUSTE:  { label: "Ajuste",  cor: C.yellow, icone: "±" },
};

interface ConfiguracaoFidelidade {
  ativo: boolean;
  reaisPorPonto: number;
  pontosParaUmReal: number;
  minimoResgate: number;
  maximoDescPct: number;
}

interface ClienteRef {
  id: string;
  nome: string;
  cpfCnpj?: string | null;
}

interface VendaRef {
  numero: string | number;
}

interface UserRef {
  nome?: string;
}

interface Movimento {
  id: string;
  createdAt: string;
  tipo: TipoMovimento;
  pontos: number;
  descricao?: string | null;
  user?: UserRef | null;
  venda?: VendaRef | null;
}

interface DadosPontos {
  saldo: number;
  totalGanho: number;
  totalResgatado: number;
  historico: Movimento[];
}

// ============ PILL ============

function Pill({ tipo }: { tipo: TipoMovimento }) {
  const info = TIPO_INFO[tipo] || { label: tipo, cor: C.muted, icone: "?" };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full text-[11px] font-bold"
      style={{
        padding: "2px 10px",
        background: info.cor + "22",
        color: info.cor,
        letterSpacing: ".04em",
      }}
    >
      {info.icone} {info.label}
    </span>
  );
}

// ==================== ABA CONFIGURACAO ====================

interface AbaProps {
  user: SessionUser;
}

function AbaConfig({ user }: AbaProps) {
  const podeEditar = user.role === "ADMIN";
  const [config, setConfig] = useState<ConfiguracaoFidelidade | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  const [ativo, setAtivo] = useState(true);
  const [reaisPorPonto, setReaisPorPonto] = useState("1");
  const [pontosParaUmReal, setPontosParaUmReal] = useState("100");
  const [minimoResgate, setMinimoResgate] = useState("100");
  const [maximoDescPct, setMaximoDescPct] = useState("50");

  useEffect(() => {
    api.obterConfiguracaoFidelidade()
      .then((r) => {
        const c = r as ConfiguracaoFidelidade;
        setConfig(c);
        setAtivo(c.ativo);
        setReaisPorPonto(String(c.reaisPorPonto));
        setPontosParaUmReal(String(c.pontosParaUmReal));
        setMinimoResgate(String(c.minimoResgate));
        setMaximoDescPct(String(c.maximoDescPct));
      })
      .catch(() => setErro("Erro ao carregar configuracao"));
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(""); setOk("");
    try {
      const c = await api.salvarConfiguracaoFidelidade({
        ativo,
        reaisPorPonto: Number(reaisPorPonto),
        pontosParaUmReal: parseInt(pontosParaUmReal, 10),
        minimoResgate: parseInt(minimoResgate, 10),
        maximoDescPct: Number(maximoDescPct),
      }) as ConfiguracaoFidelidade;
      setConfig(c);
      setOk("Configuracao salva com sucesso.");
      setTimeout(() => setOk(""), 3000);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  if (!config) {
    return <div className="text-gp-muted py-8 text-center">Carregando...</div>;
  }

  const exemploPontos = Math.floor(100 / Number(reaisPorPonto) || 0);
  const exemploDesconto = Math.floor(parseInt(pontosParaUmReal, 10) || 100);

  const inputClass = "w-full bg-gp-card text-gp-text rounded-lg text-sm";
  const inputStyle: CSSProperties = {
    border: `1px solid ${C.border}`,
    padding: "10px 12px",
    boxSizing: "border-box",
  };

  return (
    <form onSubmit={salvar} className="flex flex-col gap-5 max-w-[560px]">
      {/* Toggle ativo */}
      <div
        className="flex items-center justify-between px-5 py-4 rounded-xl"
        style={{
          background: ativo ? C.green + "18" : C.card,
          border: `1px solid ${ativo ? C.green + "44" : C.border}`,
        }}
      >
        <div>
          <div className="text-gp-text font-semibold text-sm">Programa de Fidelidade</div>
          <div className="text-gp-muted text-xs mt-0.5">
            {ativo ? "Ativo — clientes acumulam e resgatam pontos" : "Inativo — nenhum ponto é acumulado ou resgatado"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => podeEditar && setAtivo((v) => !v)}
          disabled={!podeEditar}
          aria-label={ativo ? "Desativar programa" : "Ativar programa"}
          className="border-none relative"
          style={{
            width: 48,
            height: 26,
            borderRadius: 13,
            cursor: podeEditar ? "pointer" : "default",
            background: ativo ? C.green : C.border,
            transition: "background .2s",
          }}
        >
          <span
            className="absolute rounded-full"
            style={{
              top: 3,
              left: ativo ? 25 : 3,
              width: 20,
              height: 20,
              background: C.white,
              transition: "left .2s",
            }}
          />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-gp-muted text-xs font-semibold block mb-1.5">
            Reais por ponto (R$ por ponto ganho)
          </label>
          <input
            type="number" step="0.01" min="0.01" value={reaisPorPonto}
            onChange={(e) => setReaisPorPonto(e.target.value)}
            disabled={!podeEditar}
            className={inputClass}
            style={inputStyle}
          />
          <div className="text-gp-muted text-[11px] mt-1">
            A cada R$ {reaisPorPonto || "1"} gasto, o cliente ganha 1 ponto
          </div>
        </div>
        <div>
          <label className="text-gp-muted text-xs font-semibold block mb-1.5">
            Pontos para R$ 1 de desconto
          </label>
          <input
            type="number" step="1" min="1" value={pontosParaUmReal}
            onChange={(e) => setPontosParaUmReal(e.target.value)}
            disabled={!podeEditar}
            className={inputClass}
            style={inputStyle}
          />
          <div className="text-gp-muted text-[11px] mt-1">
            {pontosParaUmReal || "100"} pontos = R$ 1,00 de desconto
          </div>
        </div>
        <div>
          <label className="text-gp-muted text-xs font-semibold block mb-1.5">
            Mínimo de resgate (pontos)
          </label>
          <input
            type="number" step="1" min="0" value={minimoResgate}
            onChange={(e) => setMinimoResgate(e.target.value)}
            disabled={!podeEditar}
            className={inputClass}
            style={inputStyle}
          />
          <div className="text-gp-muted text-[11px] mt-1">
            Pontos mínimos para resgatar em uma compra
          </div>
        </div>
        <div>
          <label className="text-gp-muted text-xs font-semibold block mb-1.5">
            Desconto máximo por resgate (%)
          </label>
          <input
            type="number" step="0.1" min="0" max="100" value={maximoDescPct}
            onChange={(e) => setMaximoDescPct(e.target.value)}
            disabled={!podeEditar}
            className={inputClass}
            style={inputStyle}
          />
          <div className="text-gp-muted text-[11px] mt-1">
            Limite de desconto via pontos por compra
          </div>
        </div>
      </div>

      {/* Preview das regras */}
      <div
        className="rounded-[10px] text-xs text-gp-muted"
        style={{
          padding: "14px 18px",
          background: C.accent + "11",
          border: `1px solid ${C.accent + "33"}`,
          lineHeight: 1.7,
        }}
      >
        <div
          className="text-gp-accent font-bold mb-1.5 text-[11px] uppercase"
          style={{ letterSpacing: ".06em" }}
        >
          Preview das regras
        </div>
        <div>• Compra de <strong className="text-gp-text">R$ 100</strong> → ganha <strong className="text-gp-green">{exemploPontos} pontos</strong></div>
        <div>• <strong className="text-gp-text">{exemploDesconto} pontos</strong> valem <strong className="text-gp-accent">R$ 1,00</strong> de desconto</div>
        <div>• Resgate mínimo: <strong className="text-gp-text">{minimoResgate || "0"} pontos</strong></div>
        <div>• Limite de desconto: <strong className="text-gp-text">{maximoDescPct || "0"}% do subtotal</strong></div>
      </div>

      {erro && <div className="text-gp-red text-[13px]">{erro}</div>}
      {ok && <div className="text-gp-green text-[13px]">{ok}</div>}

      {podeEditar && (
        <button
          type="submit"
          disabled={salvando}
          className="rounded-[10px] border-none cursor-pointer text-gp-white font-bold text-sm self-start"
          style={{
            padding: "12px 24px",
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
          }}
        >
          {salvando ? "Salvando..." : "Salvar configuração"}
        </button>
      )}
      {!podeEditar && (
        <div className="text-gp-muted text-xs">Apenas administradores podem alterar as configurações de fidelidade.</div>
      )}
    </form>
  );
}

// ==================== ABA CONSULTAR ====================

function AbaConsultar({ user }: AbaProps) {
  const podeAjustar = user.role === "ADMIN" || user.role === "GERENTE";
  const [clientes, setClientes] = useState<ClienteRef[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [busca, setBusca] = useState("");
  const [dados, setDados] = useState<DadosPontos | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const [ajusteAberto, setAjusteAberto] = useState(false);
  const [ajusteTipo, setAjusteTipo] = useState<TipoMovimento>("GANHO");
  const [ajustePontos, setAjustePontos] = useState("");
  const [ajusteDesc, setAjusteDesc] = useState("");
  const [ajustando, setAjustando] = useState(false);
  const [ajusteErro, setAjusteErro] = useState("");

  useEffect(() => {
    api.listarClientes({ ativo: "true" })
      .then((lista) => setClientes(Array.isArray(lista) ? (lista as ClienteRef[]) : []))
      .catch(() => {});
  }, []);

  const clientesFiltrados = clientes.filter((c) => {
    const q = busca.toLowerCase();
    return !q || c.nome?.toLowerCase().includes(q) || c.cpfCnpj?.includes(q);
  }).slice(0, 20);

  const carregar = useCallback(async (id: string) => {
    if (!id) { setDados(null); return; }
    setCarregando(true);
    setErro("");
    try {
      const d = await api.pontosFidelidade(id) as DadosPontos;
      setDados(d);
    } catch (err) {
      setErro((err as Error).message);
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  function selecionarCliente(id: string) {
    setClienteId(id);
    setBusca("");
    setAjusteAberto(false);
    carregar(id);
  }

  async function submeterAjuste(e: FormEvent) {
    e.preventDefault();
    const qtd = parseInt(ajustePontos, 10);
    if (!Number.isFinite(qtd) || qtd <= 0) {
      setAjusteErro("Informe uma quantidade válida de pontos");
      return;
    }
    setAjustando(true);
    setAjusteErro("");
    try {
      await api.ajustarPontosFidelidade(clienteId, {
        tipo: ajusteTipo,
        pontos: qtd,
        descricao: ajusteDesc.trim() || null,
      });
      setAjusteAberto(false);
      setAjustePontos("");
      setAjusteDesc("");
      carregar(clienteId);
    } catch (err) {
      setAjusteErro((err as Error).message);
    } finally {
      setAjustando(false);
    }
  }

  const innerInputStyle: CSSProperties = {
    border: `1px solid ${C.border}`,
    padding: "9px 12px",
    boxSizing: "border-box",
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Seletor de cliente */}
      <div className="max-w-[420px]">
        <label className="text-gp-muted text-xs font-semibold block mb-1.5">
          Selecionar cliente
        </label>
        <div className="relative">
          <input
            value={clienteId ? (clientes.find((c) => c.id === clienteId)?.nome || clienteId) : busca}
            onChange={(e) => { setBusca(e.target.value); setClienteId(""); setDados(null); }}
            placeholder="Buscar por nome ou CPF/CNPJ..."
            aria-label="Buscar cliente"
            className="w-full bg-gp-card text-gp-text rounded-lg text-sm"
            style={{
              border: `1px solid ${C.border}`,
              padding: "10px 12px",
              boxSizing: "border-box",
            }}
          />
          {busca && !clienteId && clientesFiltrados.length > 0 && (
            <div
              className="absolute left-0 right-0 z-20 bg-gp-card rounded-lg overflow-hidden"
              style={{
                top: "calc(100% + 4px)",
                border: `1px solid ${C.border}`,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}
            >
              {clientesFiltrados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selecionarCliente(c.id)}
                  className="block w-full text-left bg-transparent border-none text-gp-text text-[13px] cursor-pointer"
                  style={{
                    padding: "10px 14px",
                    borderBottom: `1px solid ${C.border}`,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = C.border + "55"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div className="font-semibold">{c.nome}</div>
                  {c.cpfCnpj && <div className="text-gp-muted text-[11px]">{c.cpfCnpj}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {carregando && <div className="text-gp-muted text-[13px]">Carregando...</div>}
      {erro && <div className="text-gp-red text-[13px]">{erro}</div>}

      {dados && (
        <div className="flex flex-col gap-4">
          {/* Cards de saldo */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Saldo atual", valor: dados.saldo, cor: C.accent, icone: "⭐" },
              { label: "Total ganho", valor: dados.totalGanho, cor: C.green, icone: "↑" },
              { label: "Total resgatado", valor: dados.totalResgatado, cor: C.purple, icone: "↓" },
            ].map(({ label, valor, cor, icone }) => (
              <div
                key={label}
                className="bg-gp-card rounded-xl"
                style={{
                  border: `1px solid ${C.border}`,
                  padding: "16px 18px",
                }}
              >
                <div
                  className="text-gp-muted text-[11px] font-semibold mb-2"
                  style={{ letterSpacing: ".04em" }}
                >
                  {icone} {label.toUpperCase()}
                </div>
                <div
                  className="text-[28px] font-extrabold"
                  style={{ color: cor, fontVariantNumeric: "tabular-nums" }}
                >
                  {valor.toLocaleString("pt-BR")}
                  <span className="text-[13px] font-normal text-gp-muted ml-1">pts</span>
                </div>
              </div>
            ))}
          </div>

          {/* Ajuste manual */}
          {podeAjustar && (
            <div>
              {!ajusteAberto ? (
                <button
                  type="button"
                  onClick={() => setAjusteAberto(true)}
                  className="bg-transparent text-gp-text text-[13px] cursor-pointer font-semibold rounded-lg"
                  style={{
                    padding: "8px 18px",
                    border: `1px solid ${C.border}`,
                  }}
                >
                  ± Ajuste manual de pontos
                </button>
              ) : (
                <form
                  onSubmit={submeterAjuste}
                  className="bg-gp-card rounded-xl flex flex-col gap-3"
                  style={{
                    border: `1px solid ${C.border}`,
                    padding: "16px 20px",
                  }}
                >
                  <div className="text-gp-text font-bold text-sm">Ajuste manual de pontos</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-gp-muted text-xs font-semibold block mb-1">Tipo</label>
                      <select
                        value={ajusteTipo}
                        onChange={(e) => setAjusteTipo(e.target.value as TipoMovimento)}
                        aria-label="Tipo do ajuste"
                        className="w-full bg-gp-surface text-gp-text rounded-lg text-[13px]"
                        style={innerInputStyle}
                      >
                        <option value="GANHO">Ganho (creditar)</option>
                        <option value="RESGATE">Resgate (debitar)</option>
                        <option value="AJUSTE">Ajuste administrativo</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-gp-muted text-xs font-semibold block mb-1">Pontos</label>
                      <input
                        type="number" min="1" value={ajustePontos}
                        onChange={(e) => setAjustePontos(e.target.value)}
                        placeholder="Ex: 100"
                        className="w-full bg-gp-surface text-gp-text rounded-lg text-[13px]"
                        style={innerInputStyle}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-gp-muted text-xs font-semibold block mb-1">Motivo (opcional)</label>
                    <input
                      value={ajusteDesc} onChange={(e) => setAjusteDesc(e.target.value)}
                      placeholder="Ex: BRINDE ANIVERSÁRIO"
                      className="w-full bg-gp-surface text-gp-text rounded-lg text-[13px]"
                      style={innerInputStyle}
                    />
                  </div>
                  {ajusteErro && <div className="text-gp-red text-xs">{ajusteErro}</div>}
                  <div className="flex gap-[10px]">
                    <button
                      type="button"
                      onClick={() => { setAjusteAberto(false); setAjusteErro(""); }}
                      className="bg-transparent text-gp-muted text-[13px] cursor-pointer rounded-lg"
                      style={{
                        padding: "8px 18px",
                        border: `1px solid ${C.border}`,
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit" disabled={ajustando}
                      className="rounded-lg border-none cursor-pointer text-gp-white font-bold text-[13px]"
                      style={{
                        padding: "8px 20px",
                        background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                      }}
                    >
                      {ajustando ? "Salvando..." : "Confirmar ajuste"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Histórico */}
          <div>
            <div
              className="text-gp-muted text-xs font-semibold mb-2.5"
              style={{ letterSpacing: ".04em" }}
            >
              HISTÓRICO DE MOVIMENTAÇÕES
            </div>
            {dados.historico.length === 0 ? (
              <div className="text-gp-muted text-[13px] py-5">Nenhuma movimentação registrada.</div>
            ) : (
              <div
                className="bg-gp-card rounded-xl overflow-hidden"
                style={{ border: `1px solid ${C.border}` }}
              >
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr style={{ background: C.surface }}>
                      {["Data", "Tipo", "Pontos", "Descrição", "Vendedor", "Venda"].map((h) => (
                        <th
                          key={h}
                          className="text-gp-muted text-[11px] font-semibold text-left"
                          style={{
                            padding: "10px 14px",
                            letterSpacing: ".04em",
                            borderBottom: `1px solid ${C.border}`,
                          }}
                        >
                          {h.toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.historico.map((m, i) => {
                      const info = TIPO_INFO[m.tipo] || { cor: C.muted, icone: "?", label: m.tipo };
                      const ehCredito = m.tipo === "GANHO" || m.tipo === "AJUSTE";
                      return (
                        <tr
                          key={m.id}
                          style={{ borderBottom: i < dados.historico.length - 1 ? `1px solid ${C.border}` : "none" }}
                        >
                          <td className="text-gp-muted whitespace-nowrap" style={{ padding: "10px 14px" }}>
                            {fmtData(m.createdAt)}
                          </td>
                          <td style={{ padding: "10px 14px" }}><Pill tipo={m.tipo} /></td>
                          <td
                            className="font-bold"
                            style={{ padding: "10px 14px", color: info.cor, fontVariantNumeric: "tabular-nums" }}
                          >
                            {ehCredito ? "+" : "−"}{m.pontos.toLocaleString("pt-BR")}
                          </td>
                          <td className="text-gp-muted" style={{ padding: "10px 14px" }}>{m.descricao || "—"}</td>
                          <td className="text-gp-muted" style={{ padding: "10px 14px" }}>{m.user?.nome || "—"}</td>
                          <td className="text-gp-muted" style={{ padding: "10px 14px" }}>
                            {m.venda ? `#${m.venda.numero}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== PAGE ====================

interface FidelidadeProps {
  user: SessionUser;
}

interface AbaDef {
  id: AbaId;
  label: string;
  icone: string;
}

export default function Fidelidade({ user }: FidelidadeProps) {
  const [aba, setAba] = useState<AbaId>("config");

  const ABAS: AbaDef[] = [
    { id: "config", label: "Configuração", icone: "⚙" },
    { id: "consultar", label: "Consultar Clientes", icone: "🔍" },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs */}
      <div
        className="flex gap-1"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className="border-none cursor-pointer text-[13px] font-semibold bg-transparent"
            style={{
              padding: "10px 20px",
              color: aba === a.id ? C.accent : C.muted,
              borderBottom: aba === a.id ? `2px solid ${C.accent}` : "2px solid transparent",
              marginBottom: -1,
              transition: "color .15s, border-color .15s",
            }}
          >
            {a.icone} {a.label}
          </button>
        ))}
      </div>

      {aba === "config" && <AbaConfig user={user} />}
      {aba === "consultar" && <AbaConsultar user={user} />}
    </div>
  );
}
