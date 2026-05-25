import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { api, getEmpresa, getToken, BASE_URL } from "./lib/api";
import { C } from "./lib/theme";
import type { SessionUser, SegmentoEmpresa } from "./lib/api";
import { gerarComandosPedido } from "./lib/escposPedido";
import { imprimirViaBluetooth, bluetoothDisponivel } from "./lib/webBluetoothPrint";

// =====================================================================
// ETAPA#8b — Central de Comandas (Kanban /painel-comandas)
//
// Fluxo: NOVO  ->  EM_PREPARACAO  ->  CONCLUIDA
//
// Timer persistente: calculado a cada segundo a partir de comanda.criadoEm
// (ou comanda.aceitoEm para "tempo em preparacao"). Resiste a F5 porque
// nasce do timestamp do banco, nao do mount do componente.
//
// Polling: GET /comandas a cada 5s mantem o Kanban sincronizado entre
// abas/dispositivos sem WebSocket. ETAPA futura pode trocar pra SSE.
// =====================================================================

type StatusComanda = "NOVO" | "EM_PREPARACAO" | "PRONTO" | "SERVINDO" | "EM_ENTREGA" | "CONCLUIDA" | "CANCELADA";
type TipoComanda = "MESA" | "VIAGEM" | "DELIVERY";

const TIPO_META: Record<TipoComanda, { icone: string; label: string; cor: string }> = {
  MESA:     { icone: "🍽",  label: "Mesa",     cor: "#f59e0b" },
  VIAGEM:   { icone: "📦", label: "Viagem",   cor: "#a78bfa" },
  DELIVERY: { icone: "🛵", label: "Delivery", cor: "#22d3ee" },
};

interface ItemComanda {
  id: string;
  quantidade: number | string;
  precoUnitario: number | string;
  subtotal: number | string;
  observacoes?: string | null;
  produto?: {
    id: string;
    codigo: string;
    nome: string;
    unidade?: string | null;
    camposSegmento?: {
      codigoOEM?: string;
      marcaPeca?: string;
      lote?: string;
      validade?: string;
    } | null;
  } | null;
}

interface Comanda {
  id: string;
  numero: number;
  tipo: TipoComanda;
  status: StatusComanda;
  mesa?: string | null;
  enderecoEntrega?: string | null;
  entregadorNome?: string | null;
  telefoneContato?: string | null;
  observacoes?: string | null;
  total: number | string;
  criadoEm: string;
  aceitoEm?: string | null;
  prontoEm?: string | null;
  servindoEm?: string | null;
  emEntregaEm?: string | null;
  concluidoEm?: string | null;
  cliente?: { id: string; nome: string } | null;
  user?: { id: string; nome: string } | null;
  itens?: ItemComanda[];
  _count?: { itens: number };
}

// Polling adaptativo: rapido quando tem fila, devagar quando vazio.
const POLL_MS_OCUPADO = 3000;
const POLL_MS_VAZIO = 10000;
const LIMITE_GARGALO_MIN = 10;
// Janela de destaque visual de "comanda recem-chegada" (badge NOVA + flash).
const REALCE_NOVA_MS = 12000;

interface Toast { id: number; msg: string; tipo: "ok" | "erro" | "info"; }

function fmtBRL(n: number | string): string {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Timer persistente — recalcula segundo a segundo. Devolve "Mm Ss" para
// mostrar no card. Usa "agora" do client mas baseia em data do servidor.
function useTimerPersistente(desde: string | null | undefined): { minutos: number; texto: string } {
  const [, force] = useState(0);
  useEffect(() => {
    if (!desde) return;
    const i = setInterval(() => force(v => v + 1), 1000);
    return () => clearInterval(i);
  }, [desde]);
  return useMemo(() => {
    if (!desde) return { minutos: 0, texto: "—" };
    const diff = Math.max(0, Date.now() - new Date(desde).getTime());
    const totalSec = Math.floor(diff / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return { minutos: min, texto: `${min}m ${String(sec).padStart(2, "0")}s` };
  }, [desde, /* re-render por setInterval acima */ Math.floor(Date.now() / 1000)]);
}

interface Props { user: SessionUser }

export default function PainelComandas({ user }: Props) {
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [acao, setAcao] = useState<string | null>(null); // id em acao (loading)
  const [detalhe, setDetalhe] = useState<Comanda | null>(null);
  const [checkout, setCheckout] = useState<Comanda | null>(null);
  const [cancelando, setCancelando] = useState<Comanda | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [ordenacao, setOrdenacao] = useState<"TEMPO" | "VALOR" | "MESA">("TEMPO");
  const [filtroMesa, setFiltroMesa] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<"TODOS" | TipoComanda>(() => {
    try {
      const salvo = localStorage.getItem("gestaopro_painel_filtro_tipo");
      return (salvo === "MESA" || salvo === "VIAGEM" || salvo === "DELIVERY" || salvo === "TODOS")
        ? salvo as "TODOS" | TipoComanda
        : "TODOS";
    } catch { return "TODOS"; }
  });
  useEffect(() => {
    try { localStorage.setItem("gestaopro_painel_filtro_tipo", filtroTipo); } catch {}
  }, [filtroTipo]);
  const [concluidas, setConcluidas] = useState<Comanda[]>([]);
  const [mostrarConcluidas, setMostrarConcluidas] = useState<boolean>(() => {
    try { return localStorage.getItem("gestaopro_painel_mostrar_concluidas") !== "false"; } catch { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem("gestaopro_painel_mostrar_concluidas", String(mostrarConcluidas)); } catch {}
  }, [mostrarConcluidas]);
  const [idsRealce, setIdsRealce] = useState<Set<string>>(() => new Set());
  const idsConhecidosRef = useRef<Set<string>>(new Set());
  const primeiroLoadRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<{ ctx?: AudioContext }>({});
  const totalAbertasRef = useRef(0);
  const [sseAtivo, setSseAtivo] = useState(false);

  // Beep curto via Web Audio (singleton AudioContext).
  const beep = useCallback((freq: number, dur: number) => {
    try {
      const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const Ctor = w.AudioContext || w.webkitAudioContext;
      if (!Ctor) return;
      const ctx = audioRef.current.ctx || (audioRef.current.ctx = new Ctor());
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.12;
      osc.connect(gain).connect(ctx.destination);
      const t = ctx.currentTime;
      osc.start(t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur / 1000);
      osc.stop(t + dur / 1000);
    } catch {}
  }, []);

  const toast = useCallback((msg: string, tipo: Toast["tipo"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, tipo }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tipo === "erro" ? 4500 : 2500);
  }, []);

  const carregar = useCallback(async () => {
    try {
      // Em paralelo: todas as abertas (5 status pre-CONCLUIDA) e concluidas
      // de hoje (limite 20). Sem filtro de tipo aqui — o front filtra depois
      // pra evitar refetch ao trocar de aba MESA/VIAGEM/DELIVERY.
      const [r, rc] = await Promise.all([
        api.listarComandas({ status: "NOVO,EM_PREPARACAO,PRONTO,SERVINDO,EM_ENTREGA" }),
        api.listarComandas({ concluidasHoje: "true" }).catch(() => []),
      ]);
      const lista = Array.isArray(r) ? r as Comanda[] : [];
      const listaConcluidas = Array.isArray(rc) ? rc as Comanda[] : [];
      setComandas(lista);
      setConcluidas(listaConcluidas);
      totalAbertasRef.current = lista.length;
      setErro("");

      // Detecta novidades: comandas com id que nao conheciamos antes.
      // No primeiro load nao avisa nada (todas seriam "novas").
      const idsAtuais = new Set(lista.map(c => c.id));
      if (!primeiroLoadRef.current) {
        const novas = lista.filter(c => c.status === "NOVO" && !idsConhecidosRef.current.has(c.id));
        if (novas.length > 0) {
          beep(880, 120);
          setTimeout(() => beep(1175, 140), 130); // 2 tons subindo
          setIdsRealce(prev => {
            const s = new Set(prev);
            novas.forEach(c => s.add(c.id));
            return s;
          });
          // Remove realce apos a janela.
          novas.forEach(c => {
            setTimeout(() => {
              setIdsRealce(prev => {
                const s = new Set(prev);
                s.delete(c.id);
                return s;
              });
            }, REALCE_NOVA_MS);
          });
        }
      }
      idsConhecidosRef.current = idsAtuais;
      primeiroLoadRef.current = false;
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [beep]);

  // SSE: abre uma vez no mount, reconecta automatico via EventSource.
  // Eventos disparam carregar() — payload do evento e' pequeno, refetch
  // garante consistencia (filtros/ordenacao re-aplicados, paralelo com
  // a 2a chamada de concluidas hoje).
  useEffect(() => {
    const token = getToken();
    if (!token || typeof EventSource === "undefined") return;
    let cancelado = false;
    let es: EventSource | null = null;
    try {
      es = new EventSource(`${BASE_URL}/comandas/stream?token=${encodeURIComponent(token)}`);
      es.addEventListener("hello", () => { if (!cancelado) setSseAtivo(true); });
      const refresh = () => { if (!cancelado) carregar(); };
      es.addEventListener("nova", refresh);
      es.addEventListener("aceita", refresh);
      es.addEventListener("pronto", refresh);
      es.addEventListener("servindo", refresh);
      es.addEventListener("em-entrega", refresh);
      es.addEventListener("atualizada", refresh);
      es.addEventListener("cancelada", refresh);
      es.addEventListener("concluida", refresh);
      // onerror dispara tanto em falha quanto durante a reconexao automatica
      // do browser. Marca inativo — UI cai pra polling rapido enquanto isso.
      es.onerror = () => { if (!cancelado) setSseAtivo(false); };
    } catch { /* sem SSE, polling segura */ }
    return () => {
      cancelado = true;
      if (es) es.close();
      setSseAtivo(false);
    };
  }, [carregar]);

  // Polling: rapido (3-10s) sem SSE; lento (30s) com SSE ativo, so como
  // seguranca caso um evento se perca. Adapta sozinho via sseAtivoRef.
  useEffect(() => {
    let cancelado = false;
    async function tick() {
      if (cancelado) return;
      await carregar();
      if (cancelado) return;
      const delay = sseAtivo
        ? 30_000
        : (totalAbertasRef.current > 0 ? POLL_MS_OCUPADO : POLL_MS_VAZIO);
      pollRef.current = setTimeout(tick, delay);
    }
    tick();
    return () => {
      cancelado = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [carregar, sseAtivo]);

  // Debounce de busca (200ms) — evita re-filtrar a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [busca]);

  // Mesas atualmente presentes (pra montar os chips). Sem mesas duplicadas,
  // ordem alfabetica, ignora vazias.
  const mesasPresentes = useMemo(() => {
    const set = new Set<string>();
    for (const c of comandas) if (c.mesa) set.add(c.mesa);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [comandas]);

  // Se a mesa filtrada saiu da lista (ex.: ultima comanda dela foi finalizada),
  // limpa o filtro automaticamente pra nao mostrar "vazio sem motivo".
  useEffect(() => {
    if (filtroMesa && !mesasPresentes.includes(filtroMesa)) setFiltroMesa(null);
  }, [filtroMesa, mesasPresentes]);

  // Aplica busca + filtro mesa + ordenacao. Ordem importa: filtrar antes
  // de separar por status pra que o contador da coluna reflita o filtro.
  const comandasFiltradas = useMemo(() => {
    let lista = comandas;
    if (filtroTipo !== "TODOS") lista = lista.filter(c => c.tipo === filtroTipo);
    if (filtroMesa) lista = lista.filter(c => c.mesa === filtroMesa);
    if (buscaDebounced) {
      lista = lista.filter(c => {
        const num = String(c.numero);
        const mesa = (c.mesa || "").toLowerCase();
        const cli = (c.cliente?.nome || "").toLowerCase();
        return num.includes(buscaDebounced) || mesa.includes(buscaDebounced) || cli.includes(buscaDebounced);
      });
    }
    const arr = lista.slice();
    if (ordenacao === "TEMPO") {
      arr.sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime());
    } else if (ordenacao === "VALOR") {
      arr.sort((a, b) => Number(b.total) - Number(a.total));
    } else if (ordenacao === "MESA") {
      arr.sort((a, b) => {
        const m = (a.mesa || "~").localeCompare(b.mesa || "~", "pt-BR"); // sem mesa por ultimo
        return m !== 0 ? m : new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime();
      });
    }
    return arr;
  }, [comandas, buscaDebounced, filtroMesa, ordenacao]);

  const novos = comandasFiltradas.filter(c => c.status === "NOVO");
  const emPrep = comandasFiltradas.filter(c => c.status === "EM_PREPARACAO");
  const prontos = comandasFiltradas.filter(c => c.status === "PRONTO");
  const servindo = comandasFiltradas.filter(c => c.status === "SERVINDO");
  const emEntrega = comandasFiltradas.filter(c => c.status === "EM_ENTREGA");

  // Contadores totais (sem filtro) — usado pra mostrar "3 de 12" no header.
  const totalNovos = useMemo(() => comandas.filter(c => c.status === "NOVO").length, [comandas]);
  const totalEmPrep = useMemo(() => comandas.filter(c => c.status === "EM_PREPARACAO").length, [comandas]);
  const totalProntos = useMemo(() => comandas.filter(c => c.status === "PRONTO").length, [comandas]);
  const filtroAtivo = Boolean(buscaDebounced || filtroMesa || filtroTipo !== "TODOS");

  // Quais colunas mostrar dado o filtro atual de tipo:
  //  - SERVINDO so faz sentido pra MESA;
  //  - EM_ENTREGA so pra DELIVERY;
  //  - PRONTO aparece sempre (todos os tipos passam por ela).
  const mostrarServindo = filtroTipo === "TODOS" || filtroTipo === "MESA";
  const mostrarEmEntrega = filtroTipo === "TODOS" || filtroTipo === "DELIVERY";

  // KPIs operacionais
  // - emAberto: soma do total das comandas NOVO + EM_PREPARACAO (dinheiro
  //   "preso" no Kanban — gestor sabe quanto ainda nao foi cobrado).
  // - faturadoHoje: soma do total das CONCLUIDAS de hoje.
  // - tempoMedioMin: media de (concluidoEm - criadoEm) em minutos. Util
  //   pra capacity planning ("hoje o atendimento ta levando 8min").
  const kpiEmAberto = useMemo(
    () => comandas.reduce((acc, c) => acc + (Number(c.total) || 0), 0),
    [comandas]
  );
  const kpiFaturadoHoje = useMemo(
    () => concluidas.reduce((acc, c) => acc + (Number(c.total) || 0), 0),
    [concluidas]
  );
  const kpiTempoMedioMin = useMemo(() => {
    const validos = concluidas.filter(c => c.concluidoEm && c.criadoEm);
    if (validos.length === 0) return null;
    const soma = validos.reduce((acc, c) => {
      const dt = new Date(c.concluidoEm as string).getTime() - new Date(c.criadoEm).getTime();
      return acc + Math.max(0, dt);
    }, 0);
    return Math.round(soma / validos.length / 60000);
  }, [concluidas]);

  async function aceitar(c: Comanda) {
    setAcao(c.id);
    try {
      await api.aceitarComanda(c.id);
      toast(`Comanda #${c.numero} aceita`, "ok");
      await carregar();
    } catch (err) {
      toast("Erro: " + (err as Error).message, "erro");
    } finally { setAcao(null); }
  }

  async function marcarPronto(c: Comanda) {
    setAcao(c.id);
    try {
      await api.prontoComanda(c.id);
      const proxima = c.tipo === "MESA"
        ? "garçom pode servir"
        : c.tipo === "DELIVERY"
          ? "entregador pode pegar"
          : "cliente pode retirar";
      toast(`Comanda #${c.numero} pronta — ${proxima}`, "ok");
      await carregar();
    } catch (err) {
      toast("Erro: " + (err as Error).message, "erro");
    } finally { setAcao(null); }
  }

  async function marcarServindo(c: Comanda) {
    setAcao(c.id);
    try {
      await api.servindoComanda(c.id);
      toast(`Comanda #${c.numero} servida na mesa`, "ok");
      await carregar();
    } catch (err) {
      toast("Erro: " + (err as Error).message, "erro");
    } finally { setAcao(null); }
  }

  async function marcarEmEntrega(c: Comanda) {
    setAcao(c.id);
    try {
      await api.emEntregaComanda(c.id);
      toast(`Comanda #${c.numero} saiu para entrega`, "ok");
      await carregar();
    } catch (err) {
      toast("Erro: " + (err as Error).message, "erro");
    } finally { setAcao(null); }
  }

  async function confirmarCancelar(c: Comanda, motivo: string) {
    setAcao(c.id);
    setCancelando(null);
    try {
      await api.cancelarComanda(c.id, motivo.trim() || undefined);
      toast(`Comanda #${c.numero} cancelada`, "info");
      await carregar();
    } catch (err) {
      toast("Erro: " + (err as Error).message, "erro");
    } finally { setAcao(null); }
  }

  function abrirCheckout(c: Comanda) {
    setCheckout(c);
  }

  async function imprimirTicket(c: Comanda) {
    // Fallback do navegador — abre o modal de detalhe e dispara o
    // dialogo de impressao do browser. Util quando nao ha impressora
    // Bluetooth pareada (ver imprimirTicketBT abaixo).
    try {
      const completa = await api.obterComanda(c.id) as Comanda;
      setDetalhe(completa);
      setTimeout(() => window.print(), 300);
    } catch (err) {
      toast("Erro ao carregar comanda: " + (err as Error).message, "erro");
    }
  }

  // Impressao direta via Bluetooth ESC/POS — sem dialogo do navegador.
  // Carrega a comanda completa (precisa de camposSegmento dos itens),
  // gera o stream binario reusando o mesmo gerador do PDV, e envia.
  // Imprime cupom de COMANDA (sem forma de pagamento, com linha de
  // assinatura do vendedor — entrega pra cozinha/balcao).
  async function imprimirTicketBT(c: Comanda) {
    setAcao(c.id);
    try {
      const empresa = getEmpresa();
      const segmento: SegmentoEmpresa = empresa?.segmento || "GERAL";
      const completa = await api.obterComanda(c.id) as Comanda;
      const cmds = gerarComandosPedido(
        {
          numero: completa.numero,
          createdAt: completa.criadoEm,
          total: completa.total,
          cliente: completa.cliente,
          user: completa.user,
          itens: (completa.itens || []).map(it => ({
            quantidade: it.quantidade,
            precoUnitario: it.precoUnitario,
            subtotal: it.subtotal,
            produto: it.produto || undefined,
          })),
          observacoes: completa.observacoes,
        },
        {
          nome: empresa?.nome,
          cnpj: empresa?.cnpj,
          telefone: typeof empresa?.telefone === "string" ? empresa.telefone : undefined,
        },
        {
          larguraMm: 80,
          segmento,
          cortarPapel: true,
          vendedorAssinatura: true,
          mensagemRodape: completa.mesa ? `Entregar em: ${completa.mesa}` : null,
        },
      );
      await imprimirViaBluetooth(cmds);
      toast(`Comanda #${c.numero} enviada pra impressora`, "ok");
    } catch (err) {
      toast("Falha na impressão Bluetooth: " + (err as Error).message, "erro");
    } finally {
      setAcao(null);
    }
  }

  return (
    <div style={{ padding: "0 6px" }}>
      <div style={{
        marginBottom: 14, padding: "12px 14px",
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 12, marginBottom: 12,
        }}>
          <div>
            <div style={{ color: C.white, fontSize: 16, fontWeight: 700 }}>🍽️ Central de Comandas</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "1px 8px", borderRadius: 999,
                background: sseAtivo ? C.green + "22" : C.muted + "22",
                color: sseAtivo ? C.green : C.muted,
                fontSize: 10, fontWeight: 700,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: sseAtivo ? C.green : C.muted,
                  boxShadow: sseAtivo ? `0 0 6px ${C.green}` : "none",
                  animation: sseAtivo ? "pulse-live 1.6s ease-in-out infinite" : "none",
                }} />
                {sseAtivo ? "AO VIVO" : "POLLING"}
              </span>
              <span>
                {sseAtivo
                  ? `eventos em tempo real · refresh extra a cada 30s`
                  : `atualiza a cada ${POLL_MS_OCUPADO / 1000}s com fila / ${POLL_MS_VAZIO / 1000}s vazio`}
              </span>
              <span>· timer persistente · som ao chegar pedido</span>
              <style>{`
                @keyframes pulse-live {
                  0%, 100% { opacity: 1; }
                  50% { opacity: 0.4; }
                }
              `}</style>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <KpiMini titulo="Novos" valor={novos.length} totalSemFiltro={totalNovos} filtroAtivo={filtroAtivo} cor={C.yellow} />
            <KpiMini titulo="Em preparação" valor={emPrep.length} totalSemFiltro={totalEmPrep} filtroAtivo={filtroAtivo} cor={C.accent} />
          </div>
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 8,
          paddingTop: 12, borderTop: `1px dashed ${C.border}`,
        }}>
          <KpiOperacional titulo="💰 Em aberto" valor={fmtBRL(kpiEmAberto)} subtitulo="aguardando fechamento" cor={C.yellow} />
          <KpiOperacional titulo="✅ Faturado hoje" valor={fmtBRL(kpiFaturadoHoje)} subtitulo={`${concluidas.length} comanda${concluidas.length === 1 ? "" : "s"} fechada${concluidas.length === 1 ? "" : "s"}`} cor={C.green} />
          <KpiOperacional titulo="⏱ Tempo médio" valor={kpiTempoMedioMin != null ? `${kpiTempoMedioMin} min` : "—"} subtitulo="da chegada ao fechamento" cor={C.accent} />
        </div>
      </div>

      <BarraFiltros
        busca={busca}
        onBusca={setBusca}
        ordenacao={ordenacao}
        onOrdenacao={setOrdenacao}
        mesasPresentes={mesasPresentes}
        filtroMesa={filtroMesa}
        onFiltroMesa={setFiltroMesa}
        filtroTipo={filtroTipo}
        onFiltroTipo={setFiltroTipo}
        contagemTipos={{
          TODOS: comandas.length,
          MESA: comandas.filter(c => c.tipo === "MESA").length,
          VIAGEM: comandas.filter(c => c.tipo === "VIAGEM").length,
          DELIVERY: comandas.filter(c => c.tipo === "DELIVERY").length,
        }}
        filtroAtivo={filtroAtivo}
        onLimparTudo={() => { setBusca(""); setBuscaDebounced(""); setFiltroMesa(null); setFiltroTipo("TODOS"); }}
      />

      {erro && (
        <div style={{
          padding: "10px 14px", marginBottom: 12, borderRadius: 8,
          background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
        }}>{erro}</div>
      )}

      {carregando && comandas.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: C.muted }}>Carregando comandas...</div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
        }}>
          <ColunaKanban
            titulo="📥 Novos pedidos"
            cor={C.yellow}
            comandas={novos}
            onAceitar={aceitar}
            onPronto={null}
            onServindo={null}
            onEmEntrega={null}
            onCancelar={(c) => setCancelando(c)}
            onImprimir={imprimirTicket}
            onImprimirBT={imprimirTicketBT}
            onCheckout={null}
            onAbrir={(c) => setDetalhe(c)}
            acaoAtual={acao}
            idsRealce={idsRealce}
          />
          <ColunaKanban
            titulo="🍳 Em preparação"
            cor={C.accent}
            comandas={emPrep}
            onAceitar={null}
            onPronto={marcarPronto}
            onServindo={null}
            onEmEntrega={null}
            onCancelar={(c) => setCancelando(c)}
            onImprimir={imprimirTicket}
            onImprimirBT={imprimirTicketBT}
            onCheckout={abrirCheckout}
            onAbrir={(c) => setDetalhe(c)}
            acaoAtual={acao}
            idsRealce={idsRealce}
          />
          <ColunaKanban
            titulo="🔔 Pronto"
            cor="#10b981"
            comandas={prontos}
            onAceitar={null}
            onPronto={null}
            onServindo={marcarServindo}
            onEmEntrega={marcarEmEntrega}
            onCancelar={(c) => setCancelando(c)}
            onImprimir={imprimirTicket}
            onImprimirBT={imprimirTicketBT}
            onCheckout={abrirCheckout}
            onAbrir={(c) => setDetalhe(c)}
            acaoAtual={acao}
            idsRealce={idsRealce}
          />
          {mostrarServindo && (
            <ColunaKanban
              titulo="🍽 Servindo"
              cor="#f59e0b"
              comandas={servindo}
              onAceitar={null}
              onPronto={null}
              onServindo={null}
              onEmEntrega={null}
              onCancelar={(c) => setCancelando(c)}
              onImprimir={imprimirTicket}
              onImprimirBT={imprimirTicketBT}
              onCheckout={abrirCheckout}
              onAbrir={(c) => setDetalhe(c)}
              acaoAtual={acao}
              idsRealce={idsRealce}
            />
          )}
          {mostrarEmEntrega && (
            <ColunaKanban
              titulo="🛵 Em entrega"
              cor="#22d3ee"
              comandas={emEntrega}
              onAceitar={null}
              onPronto={null}
              onServindo={null}
              onEmEntrega={null}
              onCancelar={(c) => setCancelando(c)}
              onImprimir={imprimirTicket}
              onImprimirBT={imprimirTicketBT}
              onCheckout={abrirCheckout}
              onAbrir={(c) => setDetalhe(c)}
              acaoAtual={acao}
              idsRealce={idsRealce}
            />
          )}
          <ColunaConcluidas
            comandas={concluidas}
            expandida={mostrarConcluidas}
            onToggle={() => setMostrarConcluidas(v => !v)}
            onAbrir={(c) => setDetalhe(c)}
          />
        </div>
      )}

      {detalhe && (
        <ModalDetalheComanda
          comanda={detalhe}
          onFechar={() => setDetalhe(null)}
          onAtualizar={() => { carregar(); toast("Comanda atualizada", "ok"); }}
        />
      )}
      {checkout && (
        <ModalCheckoutComanda
          comanda={checkout}
          onCancelar={() => setCheckout(null)}
          onConcluido={async () => {
            setCheckout(null);
            toast("Venda finalizada com sucesso", "ok");
            await carregar();
          }}
        />
      )}
      {cancelando && (
        <CancelarComandaModal
          comanda={cancelando}
          onFechar={() => setCancelando(null)}
          onConfirmar={(motivo) => confirmarCancelar(cancelando, motivo)}
        />
      )}
      <ToastHost toasts={toasts} />
    </div>
  );
}

// =====================================================================
// BarraFiltros — busca, ordenacao e chips de mesa pra Central de Comandas.
// Aparece entre o header e o grid. Em pico (>15 comandas) e' a UX critica
// pra achar um pedido especifico sem precisar olhar card por card.
// =====================================================================
function BarraFiltros({
  busca, onBusca, ordenacao, onOrdenacao,
  mesasPresentes, filtroMesa, onFiltroMesa,
  filtroTipo, onFiltroTipo, contagemTipos,
  filtroAtivo, onLimparTudo,
}: {
  busca: string;
  onBusca: (v: string) => void;
  ordenacao: "TEMPO" | "VALOR" | "MESA";
  onOrdenacao: (v: "TEMPO" | "VALOR" | "MESA") => void;
  mesasPresentes: string[];
  filtroMesa: string | null;
  onFiltroMesa: (v: string | null) => void;
  filtroTipo: "TODOS" | TipoComanda;
  onFiltroTipo: (v: "TODOS" | TipoComanda) => void;
  contagemTipos: { TODOS: number; MESA: number; VIAGEM: number; DELIVERY: number };
  filtroAtivo: boolean;
  onLimparTudo: () => void;
}) {
  const opcOrden: Array<{ id: "TEMPO" | "VALOR" | "MESA"; label: string; icone: string }> = [
    { id: "TEMPO", label: "Tempo", icone: "⏱" },
    { id: "VALOR", label: "Valor", icone: "💰" },
    { id: "MESA", label: "Mesa", icone: "📍" },
  ];
  const opcTipos: Array<{ id: "TODOS" | TipoComanda; label: string; icone: string }> = [
    { id: "TODOS", label: "Tudo", icone: "📋" },
    { id: "MESA", label: "Mesa", icone: TIPO_META.MESA.icone },
    { id: "VIAGEM", label: "Viagem", icone: TIPO_META.VIAGEM.icone },
    { id: "DELIVERY", label: "Delivery", icone: TIPO_META.DELIVERY.icone },
  ];
  return (
    <div style={{
      marginBottom: 12, padding: "10px 12px",
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
      display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
    }}>
      {/* Segmento de tipos — mais alto visualmente (primeiro filtro a aplicar). */}
      <div style={{
        display: "flex", gap: 4, padding: 3,
        background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`,
        width: "100%",
      }}>
        {opcTipos.map(opt => {
          const ativo = filtroTipo === opt.id;
          const corBase = opt.id === "TODOS" ? C.accent
            : opt.id === "MESA" ? TIPO_META.MESA.cor
            : opt.id === "VIAGEM" ? TIPO_META.VIAGEM.cor
            : TIPO_META.DELIVERY.cor;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onFiltroTipo(opt.id)}
              style={{
                flex: 1, padding: "6px 10px", borderRadius: 6,
                background: ativo ? corBase + "33" : "transparent",
                border: "none",
                color: ativo ? corBase : C.muted,
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >{opt.icone} {opt.label} <span style={{ opacity: 0.65, fontWeight: 500 }}>· {contagemTipos[opt.id]}</span></button>
          );
        })}
      </div>
      <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
        <span style={{
          position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
          color: C.muted, fontSize: 13, pointerEvents: "none",
        }}>🔍</span>
        <input
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar #número, mesa ou cliente…"
          style={{
            width: "100%", padding: "8px 30px 8px 30px", borderRadius: 8,
            background: C.surface, border: `1px solid ${C.border}`,
            color: C.text, fontSize: 13, outline: "none", fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
        {busca && (
          <button
            type="button"
            onClick={() => onBusca("")}
            aria-label="Limpar busca"
            style={{
              position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
              background: "transparent", border: "none", color: C.muted,
              fontSize: 16, cursor: "pointer", padding: "2px 6px",
            }}
          >×</button>
        )}
      </div>

      <div style={{
        display: "flex", gap: 4, padding: 3,
        background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`,
      }}>
        {opcOrden.map(opt => {
          const ativo = ordenacao === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onOrdenacao(opt.id)}
              style={{
                padding: "5px 10px", borderRadius: 6,
                background: ativo ? C.accent + "33" : "transparent",
                border: "none",
                color: ativo ? C.accent : C.muted,
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >{opt.icone} {opt.label}</button>
          );
        })}
      </div>

      {mesasPresentes.length > 0 && (
        <div style={{
          display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center",
          flex: "1 1 auto", minWidth: 0,
        }}>
          <span style={{ color: C.muted, fontSize: 11, marginRight: 2 }}>Mesa:</span>
          {mesasPresentes.slice(0, 8).map(m => {
            const ativo = filtroMesa === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => onFiltroMesa(ativo ? null : m)}
                style={{
                  padding: "3px 9px", borderRadius: 999,
                  background: ativo ? C.accent + "33" : C.surface,
                  border: `1px solid ${ativo ? C.accent : C.border}`,
                  color: ativo ? C.accent : C.muted,
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
                title={m}
              >📍 {m}</button>
            );
          })}
          {mesasPresentes.length > 8 && (
            <span style={{ color: C.muted, fontSize: 10 }}>+{mesasPresentes.length - 8}</span>
          )}
        </div>
      )}

      {filtroAtivo && (
        <button
          type="button"
          onClick={onLimparTudo}
          style={{
            padding: "5px 10px", borderRadius: 6,
            background: "transparent", border: `1px solid ${C.muted}55`,
            color: C.muted, fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}
        >× Limpar filtros</button>
      )}
    </div>
  );
}

// =====================================================================
// KPI operacional — segunda fileira do header (valores em $, tempo medio).
// Layout mais largo que KpiMini (que e' compacto pra contagens).
function KpiOperacional({ titulo, valor, subtitulo, cor }: {
  titulo: string; valor: string; subtitulo: string; cor: string;
}) {
  return (
    <div style={{
      padding: "8px 12px", borderRadius: 8,
      background: C.surface, border: `1px solid ${cor}33`,
      borderLeft: `3px solid ${cor}`,
    }}>
      <div style={{ color: cor, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{titulo}</div>
      <div style={{ color: C.white, fontSize: 16, fontWeight: 700, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{valor}</div>
      <div style={{ color: C.muted, fontSize: 10, marginTop: 1 }}>{subtitulo}</div>
    </div>
  );
}

function KpiMini({ titulo, valor, totalSemFiltro, filtroAtivo, cor }: {
  titulo: string; valor: number; totalSemFiltro?: number; filtroAtivo?: boolean; cor: string;
}) {
  const mostraTotal = filtroAtivo && totalSemFiltro != null && totalSemFiltro !== valor;
  return (
    <div style={{
      padding: "6px 12px", borderRadius: 8, minWidth: 100,
      background: cor + "18", border: `1px solid ${cor}55`,
    }}>
      <div style={{ color: cor, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{titulo}</div>
      <div style={{ color: C.white, fontSize: 22, fontWeight: 700 }}>
        {valor}
        {mostraTotal && (
          <span style={{ color: C.muted, fontSize: 12, fontWeight: 500, marginLeft: 4 }}>
            / {totalSemFiltro}
          </span>
        )}
      </div>
    </div>
  );
}

// =====================================================================
interface ColunaProps {
  titulo: string;
  cor: string;
  comandas: Comanda[];
  onAceitar: ((c: Comanda) => void) | null;
  onPronto: ((c: Comanda) => void) | null;
  onServindo: ((c: Comanda) => void) | null;
  onEmEntrega: ((c: Comanda) => void) | null;
  onCancelar: ((c: Comanda) => void) | null;
  onImprimir: (c: Comanda) => void;
  onImprimirBT: (c: Comanda) => void;
  onCheckout: ((c: Comanda) => void) | null;
  onAbrir: (c: Comanda) => void;
  acaoAtual: string | null;
  idsRealce: Set<string>;
}
function ColunaKanban({ titulo, cor, comandas, onAceitar, onPronto, onServindo, onEmEntrega, onCancelar, onImprimir, onImprimirBT, onCheckout, onAbrir, acaoAtual, idsRealce }: ColunaProps) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: 10, minHeight: 200,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 10, paddingBottom: 8, borderBottom: `2px solid ${cor}55`,
      }}>
        <div style={{ color: cor, fontSize: 13, fontWeight: 700 }}>{titulo}</div>
        <div style={{
          background: cor + "22", color: cor,
          padding: "2px 10px", borderRadius: 999,
          fontSize: 11, fontWeight: 700,
        }}>{comandas.length}</div>
      </div>
      {comandas.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: 24 }}>
          Sem pedidos nesta etapa.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {comandas.map(c => (
            <CardComanda key={c.id}
              comanda={c}
              cor={cor}
              onAceitar={onAceitar}
              onPronto={onPronto}
              onServindo={onServindo}
              onEmEntrega={onEmEntrega}
              onCancelar={onCancelar}
              onImprimir={onImprimir}
              onImprimirBT={onImprimirBT}
              onCheckout={onCheckout}
              onAbrir={onAbrir}
              acaoAtual={acaoAtual}
              realce={idsRealce.has(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
interface CardProps extends Omit<ColunaProps, "titulo" | "comandas" | "idsRealce"> {
  comanda: Comanda;
  realce: boolean;
}
// =====================================================================
// ColunaConcluidas — 3a coluna do Kanban: ultimas 20 finalizadas do dia.
// Colapsavel (estado persistido em localStorage). Cards compactos sem
// acoes (ja fechou). Clique abre o modal de detalhe pra revisar.
// =====================================================================
function ColunaConcluidas({ comandas, expandida, onToggle, onAbrir }: {
  comandas: Comanda[];
  expandida: boolean;
  onToggle: () => void;
  onAbrir: (c: Comanda) => void;
}) {
  const total = comandas.reduce((acc, c) => acc + (Number(c.total) || 0), 0);
  const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: 10, minHeight: expandida ? 200 : 50, opacity: 0.92,
    }}>
      <button type="button" onClick={onToggle} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", background: "transparent", border: "none",
        padding: 0, marginBottom: expandida ? 10 : 0, paddingBottom: expandida ? 8 : 0,
        borderBottom: expandida ? `2px solid ${C.green}55` : "none",
        cursor: "pointer",
      }}>
        <div style={{ color: C.green, fontSize: 13, fontWeight: 700 }}>
          {expandida ? "▾" : "▸"} ✅ Concluídas hoje
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{
            background: C.green + "22", color: C.green,
            padding: "2px 10px", borderRadius: 999,
            fontSize: 11, fontWeight: 700,
          }}>{comandas.length}</span>
          {comandas.length > 0 && (
            <span style={{ color: C.muted, fontSize: 11 }}>
              {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </span>
          )}
        </div>
      </button>
      {expandida && (
        comandas.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: 24 }}>
            Nenhuma comanda fechada hoje ainda.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {comandas.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => onAbrir(c)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", padding: "6px 10px", borderRadius: 6,
                  background: C.card, border: `1px solid ${C.border}`,
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: C.white, fontSize: 12, fontWeight: 700 }}>
                    #{c.numero}
                    {c.mesa ? <span style={{ color: C.muted, fontWeight: 500 }}> · 📍 {c.mesa}</span> : null}
                  </div>
                  <div style={{ color: C.muted, fontSize: 10, marginTop: 1 }}>
                    {c.concluidoEm ? fmtHora(c.concluidoEm) : "—"}
                    {c.cliente?.nome ? ` · 👤 ${c.cliente.nome}` : ""}
                  </div>
                </div>
                <div style={{ color: C.green, fontSize: 12, fontWeight: 700, marginLeft: 8 }}>
                  {fmtBRL(c.total)}
                </div>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// =====================================================================
function CardComanda({ comanda, cor, onAceitar, onPronto, onServindo, onEmEntrega, onCancelar, onImprimir, onImprimirBT, onCheckout, onAbrir, acaoAtual, realce }: CardProps) {
  // BT disponivel uma vez por sessao do componente — bluetoothDisponivel
  // checa typeof navigator e nao precisa de re-avaliacao.
  const bt = useMemo(() => bluetoothDisponivel(), []);
  // Timer ancorado no instante real do servidor — resiste a F5. Cada status
  // usa o timestamp em que entrou nele (ou criadoEm como fallback).
  const desde = comanda.status === "SERVINDO" && comanda.servindoEm ? comanda.servindoEm
    : comanda.status === "EM_ENTREGA" && comanda.emEntregaEm ? comanda.emEntregaEm
    : comanda.status === "PRONTO" && comanda.prontoEm ? comanda.prontoEm
    : comanda.status === "EM_PREPARACAO" && comanda.aceitoEm ? comanda.aceitoEm
    : comanda.criadoEm;
  const { minutos, texto } = useTimerPersistente(desde);
  const gargalo = minutos >= LIMITE_GARGALO_MIN;
  const itens = comanda._count?.itens ?? comanda.itens?.length ?? 0;
  const ocupado = acaoAtual === comanda.id;

  // Preview dos 2 primeiros itens (precisa que o controller inclua itens
  // no listar — ja ajustado em backend/src/controllers/comandaController.js).
  const previewItens = (comanda.itens || []).slice(0, 2);
  const sobraItens = (comanda.itens?.length || 0) - previewItens.length;

  // Borda/animacao depende da prioridade: gargalo > realce-nova > normal.
  const corBorda = gargalo ? C.red + "88" : realce ? C.yellow : cor + "55";
  const corFundo = gargalo ? C.red + "12" : realce ? C.yellow + "10" : C.card;
  const anim = gargalo
    ? "pulse-card-red 1.6s ease-in-out infinite"
    : realce
      ? "pulse-card-new 1.2s ease-out 3"
      : "none";

  return (
    <div style={{
      background: corFundo,
      border: `1px solid ${corBorda}`,
      borderRadius: 8,
      padding: 10,
      animation: anim,
      position: "relative",
    }}>
      <style>{`
        @keyframes pulse-card-red {
          0%, 100% { box-shadow: 0 0 0 0 ${C.red}44; }
          50% { box-shadow: 0 0 0 6px ${C.red}11; }
        }
        @keyframes pulse-card-new {
          0% { box-shadow: 0 0 0 0 ${C.yellow}66; }
          100% { box-shadow: 0 0 0 10px ${C.yellow}00; }
        }
      `}</style>

      {realce && (
        <div style={{
          position: "absolute", top: -6, right: 8,
          padding: "2px 8px", borderRadius: 999,
          background: C.yellow, color: "#000",
          fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
          boxShadow: `0 2px 6px ${C.yellow}55`,
        }}>NOVA</div>
      )}

      <button type="button" onClick={() => onAbrir(comanda)} style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        width: "100%", background: "transparent", border: "none",
        color: C.white, fontWeight: 700, fontSize: 13, cursor: "pointer",
        padding: 0, marginBottom: 4, textAlign: "left",
      }}>
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
          <span
            title={TIPO_META[comanda.tipo].label}
            style={{
              fontSize: 10, fontWeight: 800,
              padding: "1px 6px", borderRadius: 999,
              background: TIPO_META[comanda.tipo].cor + "22",
              color: TIPO_META[comanda.tipo].cor,
              border: `1px solid ${TIPO_META[comanda.tipo].cor}55`,
              lineHeight: 1.4,
            }}
          >{TIPO_META[comanda.tipo].icone} {TIPO_META[comanda.tipo].label}</span>
          <span>#{comanda.numero}{comanda.mesa ? ` · 📍 ${comanda.mesa}` : ""}</span>
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: gargalo ? C.red : cor,
          fontVariantNumeric: "tabular-nums",
        }}>{texto}{gargalo ? " ⚠" : ""}</span>
      </button>
      {comanda.tipo === "DELIVERY" && comanda.enderecoEntrega && (
        <div style={{ color: C.muted, fontSize: 10, marginBottom: 4, fontStyle: "italic" }}>
          📍 {comanda.enderecoEntrega}
          {comanda.entregadorNome ? ` · 🛵 ${comanda.entregadorNome}` : ""}
        </div>
      )}

      <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>
        {itens} {itens === 1 ? "item" : "itens"} ·{" "}
        <span style={{ color: C.white, fontWeight: 600 }}>{fmtBRL(comanda.total)}</span>
        {comanda.cliente?.nome && (
          <>{" · "}<span style={{ color: C.accent }}>👤 {comanda.cliente.nome}</span></>
        )}
      </div>

      {previewItens.length > 0 && (
        <div style={{
          padding: "6px 8px", marginBottom: 8,
          background: C.surface, borderRadius: 6,
          fontSize: 11, color: C.text,
          borderLeft: `2px solid ${cor}77`,
        }}>
          {previewItens.map((it) => (
            <div key={it.id} style={{
              display: "flex", justifyContent: "space-between", gap: 6,
              lineHeight: 1.4,
            }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ color: cor, fontWeight: 700 }}>{Number(it.quantidade)}×</span>{" "}
                {it.produto?.nome || "Item"}
                {it.observacoes ? <span style={{ color: C.yellow }}> · 💬</span> : null}
              </span>
            </div>
          ))}
          {sobraItens > 0 && (
            <div style={{ color: C.muted, fontSize: 10, marginTop: 2, fontStyle: "italic" }}>
              +{sobraItens} {sobraItens === 1 ? "item" : "itens"} — toque pra ver
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {onAceitar && (
          <button type="button" onClick={() => onAceitar(comanda)} disabled={ocupado}
            style={btnAcao(C.accent, ocupado)}>
            {ocupado ? "..." : "✓ Aceitar"}
          </button>
        )}
        {onPronto && (
          <button type="button" onClick={() => onPronto(comanda)} disabled={ocupado}
            style={btnAcao("#10b981", ocupado)}
            title="Marcar como pronto (saiu da cozinha/balcão)">
            🔔 Pronto
          </button>
        )}
        {onServindo && (
          <button type="button" onClick={() => onServindo(comanda)} disabled={ocupado}
            style={btnAcao("#f59e0b", ocupado)}
            title="Garçom entregou na mesa (cliente consumindo)">
            🍽 Servir
          </button>
        )}
        {onEmEntrega && (
          <button type="button" onClick={() => onEmEntrega(comanda)} disabled={ocupado}
            style={btnAcao("#22d3ee", ocupado)}
            title="Entregador saiu com o pedido">
            🛵 Entregar
          </button>
        )}
        {onCheckout && (
          <button type="button" onClick={() => onCheckout(comanda)} disabled={ocupado}
            style={btnAcao(C.green, ocupado)}>
            💰 Fechar venda
          </button>
        )}
        <button type="button" onClick={() => onImprimir(comanda)} disabled={ocupado}
          aria-label="Imprimir comanda (navegador)"
          title="Imprimir via navegador"
          style={btnAcao(C.muted, ocupado, true)}>
          🖨️
        </button>
        {bt && (
          <button type="button" onClick={() => onImprimirBT(comanda)} disabled={ocupado}
            aria-label="Imprimir via Bluetooth (ESC/POS)"
            title="Imprimir via Bluetooth (impressora térmica pareada)"
            style={btnAcao(C.accent, ocupado, true)}>
            🔌
          </button>
        )}
        {onCancelar && (
          <button type="button" onClick={() => onCancelar(comanda)} disabled={ocupado}
            aria-label="Cancelar comanda"
            style={btnAcao(C.red, ocupado, true)}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function btnAcao(cor: string, ocupado: boolean, ghost = false): React.CSSProperties {
  return {
    padding: "5px 10px", borderRadius: 6,
    background: ghost ? "transparent" : cor + "33",
    border: `1px solid ${cor}55`,
    color: cor,
    fontSize: 11, fontWeight: 700, cursor: ocupado ? "wait" : "pointer",
    opacity: ocupado ? 0.6 : 1,
  };
}

// =====================================================================
function ModalDetalheComanda({ comanda, onFechar, onAtualizar }: {
  comanda: Comanda;
  onFechar: () => void;
  onAtualizar?: () => void;
}) {
  const [completa, setCompleta] = useState<Comanda>(comanda);
  const [adicionando, setAdicionando] = useState(false);
  const [erroAdd, setErroAdd] = useState("");
  useEffect(() => {
    if (!comanda.itens) {
      api.obterComanda(comanda.id).then(c => setCompleta(c as Comanda)).catch(() => {});
    }
  }, [comanda]);

  const podeAdicionar = completa.status === "NOVO" || completa.status === "EM_PREPARACAO";

  async function recarregar() {
    try {
      const c = await api.obterComanda(completa.id);
      setCompleta(c as Comanda);
      onAtualizar?.();
    } catch {}
  }

  return (
    <div onClick={onFechar} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 200,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto",
        padding: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ color: C.white, fontSize: 17, fontWeight: 700 }}>
              Comanda #{completa.numero}{completa.mesa ? ` · ${completa.mesa}` : ""}
            </div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
              {new Date(completa.criadoEm).toLocaleString("pt-BR")}
              {completa.user?.nome ? ` · ${completa.user.nome}` : ""}
            </div>
          </div>
          <button type="button" onClick={onFechar} style={{
            background: "transparent", border: "none", color: C.muted, fontSize: 24, cursor: "pointer",
          }}>×</button>
        </div>

        {completa.cliente?.nome && (
          <div style={{
            padding: 8, borderRadius: 6, background: C.surface,
            color: C.white, fontSize: 12, marginBottom: 10,
          }}>Cliente: {completa.cliente.nome}</div>
        )}

        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: 10, marginBottom: 14,
        }}>
          {(completa.itens || []).map(it => (
            <div key={it.id} style={{
              padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12,
              display: "flex", justifyContent: "space-between", gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.white, fontWeight: 600 }}>
                  {Number(it.quantidade)} {it.produto?.unidade || "un"} · {it.produto?.nome}
                </div>
                {it.produto?.camposSegmento?.codigoOEM && (
                  <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>OEM: {it.produto.camposSegmento.codigoOEM}</div>
                )}
                {it.produto?.camposSegmento?.lote && (
                  <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>
                    Lote {it.produto.camposSegmento.lote}{it.produto.camposSegmento.validade ? ` · Val. ${it.produto.camposSegmento.validade}` : ""}
                  </div>
                )}
                {it.observacoes && (
                  <div style={{ color: C.muted, fontSize: 10, marginTop: 2, fontStyle: "italic" }}>
                    💬 {it.observacoes}
                  </div>
                )}
              </div>
              <div style={{ color: C.white, fontWeight: 600 }}>{fmtBRL(it.subtotal)}</div>
            </div>
          ))}
          <div style={{
            display: "flex", justifyContent: "space-between",
            paddingTop: 8, marginTop: 4, borderTop: `2px solid ${C.border}`,
            color: C.white, fontWeight: 700, fontSize: 14,
          }}>
            <span>Total</span>
            <span style={{ color: C.accent }}>{fmtBRL(completa.total)}</span>
          </div>
        </div>

        {podeAdicionar && (
          <button
            type="button"
            onClick={() => { setErroAdd(""); setAdicionando(true); }}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 8,
              background: C.yellow + "22", border: `1px dashed ${C.yellow}`,
              color: C.yellow, fontSize: 13, fontWeight: 700,
              cursor: "pointer", marginBottom: 10,
            }}
          >+ Adicionar item à comanda</button>
        )}
        {erroAdd && (
          <div style={{
            padding: "8px 12px", marginBottom: 10, borderRadius: 8,
            background: C.red + "22", border: `1px solid ${C.red}55`,
            color: C.red, fontSize: 12,
          }}>{erroAdd}</div>
        )}

        {completa.observacoes && (
          <div style={{
            padding: 10, borderRadius: 6, background: C.surface,
            color: C.muted, fontSize: 12, fontStyle: "italic",
          }}>Obs: {completa.observacoes}</div>
        )}
      </div>

      {adicionando && (
        <ModalAdicionarItem
          comanda={completa}
          onCancelar={() => setAdicionando(false)}
          onErro={(m) => setErroAdd(m)}
          onSucesso={async () => {
            setAdicionando(false);
            await recarregar();
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// ModalAdicionarItem — picker leve de produto + quantidade + observacao.
// Reutiliza GET /produtos (cache na primeira chamada) e POSTa em
// /comandas/:id/itens. Tenta imprimir adendo via Bluetooth se disponivel.
// =====================================================================
interface ProdutoPicker {
  id: string;
  codigo: string;
  nome: string;
  unidade?: string | null;
  precoVenda: number | string;
  tipoItem?: string;
  camposSegmento?: {
    codigoOEM?: string;
    marcaPeca?: string;
    lote?: string;
    validade?: string;
  } | null;
}

function ModalAdicionarItem({ comanda, onCancelar, onSucesso, onErro }: {
  comanda: Comanda;
  onCancelar: () => void;
  onSucesso: () => void;
  onErro: (msg: string) => void;
}) {
  const [produtos, setProdutos] = useState<ProdutoPicker[]>([]);
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const [selecionado, setSelecionado] = useState<ProdutoPicker | null>(null);
  const [quantidade, setQuantidade] = useState("1");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    api.listarProdutos({ ativo: "true" })
      .then((r: unknown) => {
        if (cancelado) return;
        const lista: ProdutoPicker[] = Array.isArray(r) ? r as ProdutoPicker[] : (r as { produtos?: ProdutoPicker[] })?.produtos || [];
        setProdutos(lista);
      })
      .catch(() => { if (!cancelado) setProdutos([]); });
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAtiva(busca.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [busca]);

  const filtrados = useMemo(() => {
    if (!buscaAtiva) return produtos.slice(0, 30);
    return produtos.filter(p =>
      p.nome.toLowerCase().includes(buscaAtiva)
      || p.codigo.toLowerCase().includes(buscaAtiva)
    ).slice(0, 30);
  }, [produtos, buscaAtiva]);

  async function confirmar() {
    if (!selecionado) return;
    const qtd = Number(quantidade.replace(",", "."));
    if (!Number.isFinite(qtd) || qtd <= 0) {
      onErro("Quantidade inválida");
      return;
    }
    setSalvando(true);
    try {
      await api.adicionarItensComanda(comanda.id, {
        itens: [{
          produtoId: selecionado.id,
          quantidade: qtd,
          precoUnitario: Number(selecionado.precoVenda),
          observacoes: observacoes.trim() || null,
        }],
      });
      onSucesso();
    } catch (err) {
      onErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onCancelar()} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 250,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        width: "100%", maxWidth: 460, maxHeight: "85vh", display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ color: C.white, fontSize: 16, fontWeight: 700 }}>
            + Adicionar item · Comanda #{comanda.numero}
          </div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
            {comanda.mesa ? `${comanda.mesa} · ` : ""}Cliente pediu mais durante a permanência
          </div>
        </div>

        {selecionado ? (
          <div style={{ padding: 20, overflowY: "auto" }}>
            <div style={{
              padding: 10, borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
              display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.white, fontWeight: 700, fontSize: 13 }}>{selecionado.nome}</div>
                <div style={{ color: C.muted, fontSize: 11 }}>
                  {selecionado.codigo} · {fmtBRL(selecionado.precoVenda)}
                </div>
              </div>
              <button type="button" onClick={() => setSelecionado(null)}
                style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 12 }}>
                trocar
              </button>
            </div>

            <label htmlFor="add-item-qtd" style={labelStyle}>Quantidade</label>
            <input
              id="add-item-qtd"
              value={quantidade}
              onChange={e => setQuantidade(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 8))}
              inputMode="decimal"
              autoFocus
              title="Quantidade do item"
              placeholder="1"
              style={{ ...inputStyle, fontSize: 18, textAlign: "center", fontWeight: 700 }}
            />

            <label htmlFor="add-item-obs" style={{ ...labelStyle, marginTop: 14 }}>Observação (opcional)</label>
            <textarea
              id="add-item-obs"
              value={observacoes}
              onChange={e => setObservacoes(e.target.value.slice(0, 300))}
              rows={2}
              placeholder="Ex.: sem cebola · bem passado"
              title="Observação do item"
              style={{ ...inputStyle, resize: "none", fontFamily: "inherit" }}
            />

            <div style={{
              marginTop: 16, padding: 10, borderRadius: 8,
              background: C.green + "11", border: `1px solid ${C.green}33`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ color: C.muted, fontSize: 11 }}>Subtotal</span>
              <span style={{ color: C.green, fontSize: 18, fontWeight: 700 }}>
                {fmtBRL((Number(quantidade.replace(",", ".")) || 0) * Number(selecionado.precoVenda))}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <div style={{ padding: "12px 20px 0" }}>
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar nome ou código…"
                title="Buscar produto"
                autoFocus
                style={inputStyle}
              />
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "12px 12px 4px" }}>
              {filtrados.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: C.muted, fontSize: 12 }}>
                  Nenhum produto encontrado.
                </div>
              ) : filtrados.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelecionado(p)}
                  style={{
                    width: "100%", textAlign: "left", padding: "10px 12px",
                    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                    color: C.white, marginBottom: 6, cursor: "pointer",
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.nome}</div>
                    <div style={{ color: C.muted, fontSize: 11 }}>{p.codigo}</div>
                  </div>
                  <div style={{ color: C.accent, fontWeight: 700, fontSize: 13 }}>{fmtBRL(p.precoVenda)}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: 16, borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
          <button type="button" onClick={onCancelar} disabled={salvando}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: salvando ? "wait" : "pointer" }}>
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={salvando || !selecionado}
            style={{ flex: 2, padding: "10px 14px", borderRadius: 8,
              background: !selecionado ? C.border : `linear-gradient(135deg, ${C.green}, ${C.accent})`,
              border: "none", color: "white", fontWeight: 800, cursor: salvando ? "wait" : (!selecionado ? "not-allowed" : "pointer"),
              opacity: !selecionado ? 0.6 : 1,
            }}>
            {salvando ? "Adicionando..." : "✓ Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// ETAPA#9a: checkout simplificado de comanda
// Forma manual (vendedor cobra na maquininha externa, depois registra
// aqui o codigo da transacao para conciliacao).
// =====================================================================
function ModalCheckoutComanda({ comanda, onCancelar, onConcluido }: {
  comanda: Comanda; onCancelar: () => void; onConcluido: () => void;
}) {
  const [forma, setForma] = useState<string>("DINHEIRO");
  const [idTransacao, setIdTransacao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    setSalvando(true); setErro("");
    try {
      await api.finalizarComanda(comanda.id, {
        formaPagamento: forma,
        idTransacao: idTransacao.trim() || undefined,
      });
      onConcluido();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onCancelar()} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 200,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        width: "100%", maxWidth: 420, padding: 22,
      }}>
        <div style={{ color: C.white, fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
          💰 Fechar venda · Comanda #{comanda.numero}
        </div>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>
          Registra a forma de pagamento, gera a venda real (com baixa de estoque)
          e dispara a impressão do comprovante para assinatura do vendedor.
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 14, textAlign: "center" }}>
          <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Total a pagar</div>
          <div style={{ color: C.accent, fontSize: 28, fontWeight: 700 }}>{fmtBRL(comanda.total)}</div>
        </div>

        <label style={labelStyle}>Forma de pagamento</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 14 }}>
          {[
            { id: "DINHEIRO", label: "Dinheiro", icone: "💵" },
            { id: "PIX", label: "PIX", icone: "⚡" },
            { id: "CARTAO_CREDITO", label: "Cartão", icone: "💳" },
          ].map(opt => (
            <button key={opt.id} type="button" onClick={() => setForma(opt.id)} style={{
              padding: "10px 6px", borderRadius: 8,
              background: forma === opt.id ? C.accent + "33" : C.surface,
              border: `2px solid ${forma === opt.id ? C.accent : C.border}`,
              color: forma === opt.id ? C.accent : C.muted,
              fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}>{opt.icone}<br />{opt.label}</button>
          ))}
        </div>

        <label style={labelStyle}>ID da transação (opcional)</label>
        <input value={idTransacao} onChange={e => setIdTransacao(e.target.value)}
          placeholder="Ex: código de autorização da maquininha"
          style={inputStyle} />

        {erro && (
          <div style={{
            padding: "8px 12px", marginTop: 10, borderRadius: 8,
            background: C.red + "22", border: `1px solid ${C.red}55`,
            color: C.red, fontSize: 12,
          }}>{erro}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onCancelar} disabled={salvando}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: salvando ? "wait" : "pointer" }}>
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={salvando}
            style={{ flex: 2, padding: "10px 14px", borderRadius: 8, background: `linear-gradient(135deg, ${C.green}, ${C.accent})`, border: "none", color: "white", fontWeight: 800, cursor: salvando ? "wait" : "pointer" }}>
            {salvando ? "Confirmando..." : "✓ Confirmar e finalizar"}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", color: C.muted, fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  background: C.surface, border: `1px solid ${C.border}`,
  color: C.text, fontSize: 13, outline: "none", fontFamily: "inherit",
  boxSizing: "border-box",
};

// =====================================================================
// CancelarComandaModal — substitui o prompt() do navegador.
// Motivo e' opcional; lista de motivos comuns acelera o cancelamento.
// =====================================================================
function CancelarComandaModal({ comanda, onFechar, onConfirmar }: {
  comanda: Comanda;
  onFechar: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const sugestoes = ["Cliente desistiu", "Erro no pedido", "Sem estoque", "Demora"];
  return (
    <div onClick={onFechar} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 250,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.card, border: `1px solid ${C.red}55`, borderRadius: 12,
        width: "100%", maxWidth: 420, padding: 20,
      }}>
        <div style={{ color: C.white, fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
          Cancelar comanda #{comanda.numero}?
        </div>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 14 }}>
          {Number(comanda._count?.itens ?? comanda.itens?.length ?? 0)} itens · {fmtBRL(comanda.total)}
          {comanda.mesa ? ` · 📍 ${comanda.mesa}` : ""}
        </div>

        <label htmlFor="cancelar-motivo" style={labelStyle}>Motivo (opcional)</label>
        <textarea
          id="cancelar-motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value.slice(0, 200))}
          rows={2}
          placeholder="Ex.: cliente desistiu"
          style={{ ...inputStyle, resize: "none", minHeight: 60 }}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, marginBottom: 14 }}>
          {sugestoes.map(s => (
            <button key={s} type="button" onClick={() => setMotivo(s)} style={{
              padding: "4px 10px", borderRadius: 999,
              background: C.surface, border: `1px solid ${C.border}`,
              color: C.muted, fontSize: 11, cursor: "pointer",
            }}>{s}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onFechar} style={{
            flex: 1, padding: "10px 14px", borderRadius: 8,
            background: C.surface, border: `1px solid ${C.border}`,
            color: C.muted, fontWeight: 700, cursor: "pointer",
          }}>Voltar</button>
          <button type="button" onClick={() => onConfirmar(motivo)} style={{
            flex: 2, padding: "10px 14px", borderRadius: 8,
            background: C.red, border: "none",
            color: "white", fontWeight: 800, cursor: "pointer",
          }}>✕ Confirmar cancelamento</button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// ToastHost — empilha toasts no canto inferior direito. Cada toast tem
// auto-dismiss controlado pelo dono via setTimeout (ja feito em toast()).
// =====================================================================
function ToastHost({ toasts }: { toasts: Toast[] }) {
  const corPorTipo = (t: Toast["tipo"]) =>
    t === "ok" ? C.green : t === "erro" ? C.red : C.accent;
  return (
    <div style={{
      position: "fixed", right: 16, bottom: 16, zIndex: 300,
      display: "flex", flexDirection: "column", gap: 8,
      pointerEvents: "none",
      maxWidth: 360,
    }}>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(10px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      {toasts.map(t => {
        const cor = corPorTipo(t.tipo);
        return (
          <div key={t.id} style={{
            padding: "10px 14px", borderRadius: 8,
            background: C.card, border: `1px solid ${cor}66`,
            color: C.white, fontSize: 13, fontWeight: 600,
            boxShadow: `0 6px 18px rgba(0,0,0,0.4), inset 3px 0 0 ${cor}`,
            animation: "toast-in 180ms ease-out",
            pointerEvents: "auto",
          }}>{t.msg}</div>
        );
      })}
    </div>
  );
}
