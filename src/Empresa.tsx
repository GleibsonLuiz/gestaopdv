// Empresa.tsx — tela de gestao da empresa (tenant) atual.
//
// Combina duas visualizacoes:
//   1. Identidade do tenant (Empresa): nome, cnpj, status, estatisticas
//      e botao de edicao (so ADMIN). Dados vem de GET /empresa.
//   2. Dados fiscais (ConfiguracaoEmpresa): reutiliza o componente
//      Configuracoes.tsx que ja gerencia razao social, telefone,
//      endereco e logotipo.
//
// Apos atualizar a identidade do tenant, sincronizamos o cache de
// empresa do localStorage para o header refletir o novo nome.

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { C } from "./lib/theme";
import { api, setSession, getToken, getUser, type SessionUser, type SessionEmpresa, type SegmentoEmpresa } from "./lib/api";
import { getAvisosRedeAtivos, setAvisosRedeAtivos } from "./lib/preferenciasUI";
import { SEGMENTO_INFO, rotuloSegmento } from "./lib/segmentos";
import Configuracoes from "./Configuracoes";

type Plano = "TRIAL" | "FREE" | "STARTER" | "PRO" | "ENTERPRISE";

type RecursoId = "clientes" | "produtos" | "usuarios" | "vendasMes";

interface Estatisticas {
  usuarios?: number;
  clientes?: number;
  produtos?: number;
  vendas?: number;
}

interface DadosEmpresa extends SessionEmpresa {
  ativo?: boolean;
  criadaEm?: string;
  atualizadaEm?: string;
  estatisticas?: Estatisticas;
  plano?: Plano;
  expiraEm?: string;
  uso?: Partial<Record<RecursoId, number>>;
  limites?: Partial<Record<RecursoId, number | null>>;
  modulos?: string[];
}

function mascararCnpj(v: string | null | undefined): string {
  const d = String(v || "").replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtNum(n: unknown): string {
  return Number(n || 0).toLocaleString("pt-BR");
}

interface EmpresaProps {
  user: SessionUser;
}

export default function Empresa({ user }: EmpresaProps) {
  const [dados, setDados] = useState<DadosEmpresa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(false);

  // Form de edicao
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState("");

  const podeEditar = user.role === "ADMIN";

  useEffect(() => {
    let ativo = true;
    api.obterEmpresa()
      .then((raw) => {
        if (!ativo) return;
        const e = raw as DadosEmpresa;
        setDados(e);
        setNome(e.nome || "");
        setCnpj(mascararCnpj(e.cnpj || ""));
      })
      .catch((err: Error) => ativo && setErro(err.message || "Erro ao carregar empresa"))
      .finally(() => ativo && setCarregando(false));
    return () => { ativo = false; };
  }, []);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    setErroSalvar("");
    try {
      const nomeLimpo = nome.trim();
      if (!nomeLimpo || nomeLimpo.length < 3) {
        setErroSalvar("Nome da empresa deve ter pelo menos 3 caracteres");
        return;
      }
      const cnpjDigitos = cnpj.replace(/\D/g, "");
      if (cnpjDigitos && cnpjDigitos.length !== 14) {
        setErroSalvar("CNPJ deve ter 14 dígitos ou ficar vazio");
        return;
      }
      const atualizada = await api.atualizarEmpresa({
        nome: nomeLimpo,
        cnpj: cnpjDigitos || null,
      }) as DadosEmpresa;

      // Sincroniza cache local da empresa (usado por outros lugares do app
      // que leem via getEmpresa() — header, etc).
      const token = getToken();
      const sessionUser = getUser();
      if (token && sessionUser) {
        setSession(token, sessionUser, {
          id: atualizada.id, nome: atualizada.nome, cnpj: atualizada.cnpj,
        });
      }

      setDados((d) => d ? { ...d, ...atualizada } : atualizada);
      setEditando(false);
    } catch (err) {
      setErroSalvar((err as Error).message || "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  function cancelarEdicao() {
    if (!dados) return;
    setNome(dados.nome || "");
    setCnpj(mascararCnpj(dados.cnpj || ""));
    setErroSalvar("");
    setEditando(false);
  }

  if (carregando) {
    return (
      <div className="p-10 text-center text-gp-muted">
        Carregando dados da empresa...
      </div>
    );
  }

  if (erro || !dados) {
    return (
      <div
        className="px-4 py-3 m-4 rounded-[10px] text-gp-red"
        style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}
      >
        {erro || "Empresa não encontrada"}
      </div>
    );
  }

  const segmento = (dados as any).segmento as string | undefined;

  const stats: { rotulo: string; valor: number; cor: string }[] = [
    { rotulo: "Usuários", valor: dados.estatisticas?.usuarios ?? 0, cor: C.accent },
    { rotulo: "Clientes", valor: dados.estatisticas?.clientes ?? 0, cor: C.green },
    { rotulo: "Produtos", valor: dados.estatisticas?.produtos ?? 0, cor: C.purple },
    { rotulo: "Vendas", valor: dados.estatisticas?.vendas ?? 0, cor: C.yellow },
  ];

  return (
    <div>
      {/* ============ BLOCO 1: IDENTIDADE DO TENANT ============ */}
      <div className="bg-gp-card border border-gp-border rounded-xl p-4 mb-3">
        <div className="flex justify-between items-start flex-wrap gap-3 mb-3">
          <div>
            <div className="text-gp-muted text-[11px] font-bold uppercase tracking-[0.5px]">
              Identidade da empresa
            </div>
            <div className="text-gp-white text-xl font-extrabold mt-1">{dados.nome}</div>
            <div className="text-gp-muted text-[13px] mt-1">
              {dados.cnpj ? `CNPJ ${mascararCnpj(dados.cnpj)}` : "Sem CNPJ cadastrado"}
              {" · "}
              <span style={{ color: dados.ativo ? C.green : C.red }}>
                {dados.ativo ? "● Ativa" : "● Inativa"}
              </span>
            </div>
            <div className="text-gp-muted text-xs mt-2">
              Cliente desde {fmtData(dados.criadaEm)}
              {" · "}
              Última atualização {fmtData(dados.atualizadaEm)}
            </div>
          </div>

          {podeEditar && !editando && (
            <button
              onClick={() => setEditando(true)}
              className="text-gp-white border-none rounded-lg px-[18px] py-[10px] font-bold text-[13px] cursor-pointer whitespace-nowrap"
              style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.purple})` }}
            >
              ✏️ Editar identidade
            </button>
          )}
        </div>

        {/* Form de edicao inline */}
        {editando && (
          <form
            onSubmit={salvar}
            className="bg-gp-surface border border-gp-border rounded-[10px] p-3 mb-3"
          >
            <div className="grid gap-3 grid-cols-2">
              <div>
                <label style={labelStyle}>Nome da empresa *</label>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={120}
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>CNPJ (opcional)</label>
                <input
                  value={cnpj}
                  onChange={(e) => setCnpj(mascararCnpj(e.target.value))}
                  placeholder="00.000.000/0000-00"
                  style={inputStyle}
                />
              </div>
            </div>
            {erroSalvar && (
              <div
                className="mt-[10px] px-3 py-2 rounded-lg text-gp-red text-xs"
                style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}
              >
                {erroSalvar}
              </div>
            )}
            <div className="flex gap-2 mt-[14px]">
              <button
                type="submit"
                disabled={salvando}
                className="bg-gp-green text-gp-white border-none rounded-lg px-4 py-2 font-bold text-xs cursor-pointer"
                style={{ opacity: salvando ? 0.6 : 1 }}
              >
                {salvando ? "Salvando..." : "💾 Salvar"}
              </button>
              <button
                type="button"
                onClick={cancelarEdicao}
                disabled={salvando}
                className="bg-gp-surface text-gp-muted border border-gp-border rounded-lg px-4 py-2 font-semibold text-xs cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* Estatisticas — strip compacto (rotulo + valor na mesma linha) */}
        <div
          className="grid gap-2 mt-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
        >
          {stats.map((s, i) => (
            <div
              key={i}
              className="bg-gp-surface border border-gp-border rounded-lg pl-3 pr-[10px] py-[6px] relative overflow-hidden flex items-baseline justify-between gap-2"
            >
              <div className="absolute top-0 left-0 w-1 h-full" style={{ background: s.cor }} />
              <span className="text-gp-muted text-[10px] font-bold uppercase tracking-[0.5px]">
                {s.rotulo}
              </span>
              <span className="text-base font-extrabold" style={{ color: s.cor }}>
                {fmtNum(s.valor)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ============ BLOCO 2: PLANO + USO vs LIMITES (ETAPA 13) ============ */}
      {dados.plano && (
        <BlocoPlano
          plano={dados.plano}
          expiraEm={dados.expiraEm}
          uso={dados.uso}
          limites={dados.limites}
        />
      )}

      {/* ============ BLOCO 2b: ASSINATURA / COBRANCA RECORRENTE ============ */}
      <BlocoAssinatura podeAssinar={podeEditar} />

      {/* ============ BLOCO 2c: CARDAPIO DIGITAL (se incluso no plano) ============ */}
      {(dados.modulos || []).includes("CARDAPIO") && (
        <BlocoCardapio podeEditar={user.role === "ADMIN" || user.role === "GERENTE"} />
      )}

      {/* ============ BLOCO 2d: DISPOSITIVOS / MAQUINAS CONECTADAS ============ */}
      <BlocoDispositivos podeEditar={user.role === "ADMIN" || user.role === "GERENTE"} />

      {/* ETAPA#6: segmento (read-only) + preferencias locais — lado a lado */}
      <div
        className="grid gap-3 mb-3 items-stretch"
        style={{ gridTemplateColumns: segmento ? "1fr 1fr" : "1fr" }}
      >
        {segmento && (
          <div className="bg-gp-card border border-gp-border rounded-xl p-4"
               style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div>
              <div className="text-gp-white text-sm font-bold">
                {SEGMENTO_INFO[segmento as SegmentoEmpresa]?.icone || "🏷️"} Segmento de negócio:{" "}
                <span style={{ color: C.accent }}>{rotuloSegmento(segmento)}</span>
              </div>
              <div className="text-gp-muted text-xs mt-[2px]">
                {SEGMENTO_INFO[segmento as SegmentoEmpresa]?.descricao || "Define quais campos extras aparecem no cadastro de produto."}
                {" "}Alteração só pelo administrador da plataforma.
              </div>
            </div>
          </div>
        )}

        {/* ============ BLOCO PREFERENCIAS LOCAIS ============ */}
        <BlocoPreferenciasUI />
      </div>

      {/* ============ BLOCO 3: DADOS FISCAIS (CONFIGURACAO EMPRESA) ============ */}
      <div className="bg-gp-card border border-gp-border rounded-xl p-1 mb-3">
        <div className="px-4 py-2 border-b border-gp-border">
          <div className="text-gp-white text-sm font-bold">📄 Dados fiscais e de exibição</div>
          <div className="text-gp-muted text-xs mt-[2px]">
            Esses dados aparecem em recibos, comprovantes e cabeçalhos de relatórios PDF.
          </div>
        </div>
        <div className="p-3">
          <Configuracoes user={user} />
        </div>
      </div>
    </div>
  );
}

// ============ BLOCO PLANO + USO vs LIMITES ============
interface BlocoPlanoProps {
  plano: Plano;
  expiraEm?: string;
  uso?: Partial<Record<RecursoId, number>>;
  limites?: Partial<Record<RecursoId, number | null>>;
}

function BlocoPlano({ plano, expiraEm, uso, limites }: BlocoPlanoProps) {
  const planosInfo: Record<Plano, { cor: string; icone: string; label: string }> = {
    TRIAL: { cor: "#f59e0b", icone: "🎫", label: "Trial" },
    FREE: { cor: C.muted, icone: "🆓", label: "Free" },
    STARTER: { cor: C.accent, icone: "🚀", label: "Starter" },
    PRO: { cor: C.purple, icone: "💎", label: "Pro" },
    ENTERPRISE: { cor: C.green, icone: "🏆", label: "Enterprise" },
  };
  const info = planosInfo[plano] || planosInfo.FREE;

  const diasParaExpirar = expiraEm
    ? Math.ceil((new Date(expiraEm).getTime() - Date.now()) / 86400000)
    : null;
  const expirou = diasParaExpirar !== null && diasParaExpirar < 0;
  const expirando = diasParaExpirar !== null && diasParaExpirar >= 0 && diasParaExpirar <= 7;

  const recursos: { id: RecursoId; label: string; icone: string }[] = [
    { id: "clientes", label: "Clientes ativos", icone: "👥" },
    { id: "produtos", label: "Produtos ativos", icone: "📦" },
    { id: "usuarios", label: "Usuários ativos", icone: "🧑‍💼" },
    { id: "vendasMes", label: "Vendas no mês", icone: "🛒" },
  ];

  return (
    <div className="bg-gp-card border border-gp-border rounded-xl p-4 mb-3">
      <div className="flex justify-between items-start flex-wrap gap-3 mb-3">
        <div>
          <div className="text-gp-muted text-[11px] font-bold uppercase tracking-[0.5px]">
            Plano atual
          </div>
          <div className="flex items-center gap-[10px] mt-[6px]">
            <span
              className="px-[14px] py-[6px] rounded-xl text-base font-extrabold"
              style={{ background: info.cor + "33", color: info.cor }}
            >
              {info.icone} {info.label.toUpperCase()}
            </span>
            {expiraEm && (
              <span
                className="text-xs"
                style={{
                  color: expirou ? C.red : (expirando ? C.yellow : C.muted),
                  fontWeight: expirou || expirando ? 700 : 500,
                }}
              >
                {expirou
                  ? `⚠️ Plano expirou em ${fmtData(expiraEm)}`
                  : expirando
                    ? `⚠️ Expira em ${diasParaExpirar}d (${fmtData(expiraEm)})`
                    : `Expira em ${diasParaExpirar}d (${fmtData(expiraEm)})`}
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        className="grid gap-[10px]"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
      >
        {recursos.map((r) => {
          const usado = uso?.[r.id] ?? 0;
          const limite = limites?.[r.id];
          const ilimitado = limite === null || limite === undefined;
          const pct = ilimitado ? 0 : Math.min(100, Math.round((usado / (limite as number)) * 100));
          const critico = !ilimitado && pct >= 90;
          const atencao = !ilimitado && pct >= 70 && pct < 90;
          const cor = critico ? C.red : atencao ? C.yellow : C.green;
          return (
            <div
              key={r.id}
              className="bg-gp-surface border border-gp-border rounded-[10px] px-3 py-2"
            >
              <div className="flex justify-between items-baseline mb-[6px]">
                <div className="text-gp-text text-xs font-bold">
                  {r.icone} {r.label}
                </div>
                <div
                  className="text-[11px] font-bold"
                  style={{ color: ilimitado ? C.green : (critico ? C.red : C.muted) }}
                >
                  {ilimitado
                    ? `${fmtNum(usado)} / ∞`
                    : `${fmtNum(usado)} / ${fmtNum(limite)}`}
                </div>
              </div>
              {!ilimitado && (
                <div className="relative h-2 bg-gp-bg rounded overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${pct}%`, background: cor }}
                  />
                </div>
              )}
              {!ilimitado && critico && (
                <div className="text-gp-red text-[10px] font-bold mt-1">
                  ⚠️ Limite quase atingido — considere fazer upgrade
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 px-3 py-[6px] bg-gp-bg rounded-lg text-[11px] text-gp-muted">
        Para alterar o plano ou ampliar limites, entre em contato com o suporte.
      </div>
    </div>
  );
}

// ============ BLOCO ASSINATURA / COBRANCA RECORRENTE ============
//
// Mostra o estado da assinatura do SaaS (status, valor, proxima cobranca),
// permite ao ADMIN contratar/trocar de plano (gera link de pagamento ou ativa
// na hora no provedor mock) e lista o historico de cobrancas. Distinto do
// BlocoPlano (que mostra uso vs limites) — aqui e o lado financeiro/cobranca.

type StatusAssinatura = "TRIAL" | "ATIVA" | "INADIMPLENTE" | "CANCELADA";

interface PlanoCatalogo {
  plano: string;
  valorMensal: number;
  rotulo: string;
  descricao: string;
  assinavel: boolean;
}

interface Cobranca {
  id: string;
  valor: number;
  status: "PENDENTE" | "PAGA" | "VENCIDA" | "CANCELADA";
  vencimento?: string;
  pagoEm?: string;
  metodo?: string;
  linkPagamento?: string;
  descricao?: string;
  criadaEm?: string;
}

interface AssinaturaInfo {
  plano: Plano;
  expiraEm?: string;
  statusAssinatura: StatusAssinatura;
  provedor?: string;
  valorMensal?: number | null;
  ultimoPagamentoEm?: string;
  proximaCobrancaEm?: string;
  cobrancaPendente?: Cobranca | null;
  historico?: Cobranca[];
}

const STATUS_ASSINATURA_INFO: Record<StatusAssinatura, { cor: string; label: string; icone: string }> = {
  TRIAL: { cor: "#f59e0b", label: "Em período de teste", icone: "🎫" },
  ATIVA: { cor: "#22c55e", label: "Assinatura ativa", icone: "✅" },
  INADIMPLENTE: { cor: "#ef4444", label: "Pagamento em atraso", icone: "⚠️" },
  CANCELADA: { cor: C.muted, label: "Assinatura cancelada", icone: "🚫" },
};

const STATUS_COBRANCA_COR: Record<Cobranca["status"], string> = {
  PENDENTE: "#f59e0b",
  PAGA: "#22c55e",
  VENCIDA: "#ef4444",
  CANCELADA: C.muted,
};

function fmtMoeda(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function BlocoAssinatura({ podeAssinar }: { podeAssinar: boolean }) {
  const [info, setInfo] = useState<AssinaturaInfo | null>(null);
  const [planos, setPlanos] = useState<PlanoCatalogo[]>([]);
  const [cobrancaHabilitada, setCobrancaHabilitada] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [assinando, setAssinando] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function carregar() {
    setCarregando(true); setErro("");
    try {
      const [a, p] = await Promise.all([
        api.billingAssinatura() as Promise<AssinaturaInfo>,
        api.billingPlanos() as Promise<{ planos: PlanoCatalogo[]; cobrancaHabilitada?: boolean }>,
      ]);
      setInfo(a);
      setPlanos(p.planos || []);
      setCobrancaHabilitada(p.cobrancaHabilitada !== false);
    } catch (err) {
      setErro((err as Error).message || "Erro ao carregar assinatura");
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); }, []);

  async function assinar(plano: string) {
    setAssinando(plano); setMsg(""); setErro("");
    try {
      const r = await api.billingAssinar(plano) as {
        ativada?: boolean; linkPagamento?: string | null;
      };
      if (r.linkPagamento) {
        // Provedor real: abre o link de pagamento (PIX/boleto/cartao).
        window.open(r.linkPagamento, "_blank", "noopener");
        setMsg("Cobrança gerada. Conclua o pagamento na aba aberta — o acesso é liberado automaticamente após a confirmação.");
      } else if (r.ativada) {
        setMsg("Plano ativado com sucesso! 🎉");
      }
      await carregar();
    } catch (err) {
      setErro((err as Error).message || "Não foi possível iniciar a assinatura");
    } finally {
      setAssinando(null);
    }
  }

  if (carregando && !info) {
    return (
      <div className="bg-gp-card border border-gp-border rounded-xl p-4 mb-3 text-gp-muted text-sm">
        Carregando assinatura...
      </div>
    );
  }

  const status = info?.statusAssinatura || "TRIAL";
  const si = STATUS_ASSINATURA_INFO[status];
  const pendente = info?.cobrancaPendente;
  const historico = info?.historico || [];

  return (
    <div className="bg-gp-card border border-gp-border rounded-xl p-4 mb-3">
      <div className="flex justify-between items-start flex-wrap gap-3 mb-3">
        <div>
          <div className="text-gp-muted text-[11px] font-bold uppercase tracking-[0.5px]">
            Assinatura
          </div>
          <div className="flex items-center gap-[10px] mt-[6px]">
            <span
              className="px-[14px] py-[6px] rounded-xl text-sm font-extrabold"
              style={{ background: si.cor + "22", color: si.cor }}
            >
              {si.icone} {si.label}
            </span>
            {info?.valorMensal ? (
              <span className="text-gp-muted text-xs">
                {fmtMoeda(info.valorMensal)}/mês
              </span>
            ) : null}
          </div>
          <div className="text-gp-muted text-xs mt-2">
            {info?.proximaCobrancaEm
              ? <>Próxima cobrança: <strong>{fmtData(info.proximaCobrancaEm)}</strong></>
              : "Sem cobrança recorrente ativa."}
            {info?.ultimoPagamentoEm && <> · Último pagamento: {fmtData(info.ultimoPagamentoEm)}</>}
          </div>
        </div>
      </div>

      {erro && (
        <div
          className="mb-3 px-3 py-2 rounded-lg text-gp-red text-xs"
          style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}
        >
          {erro}
        </div>
      )}
      {msg && (
        <div
          className="mb-3 px-3 py-2 rounded-lg text-xs"
          style={{ background: C.green + "22", border: `1px solid ${C.green}55`, color: C.green }}
        >
          {msg}
        </div>
      )}

      {/* Cobranca em aberto — link para pagar agora */}
      {pendente && pendente.linkPagamento && (
        <div
          className="mb-3 px-3 py-[10px] rounded-lg flex items-center justify-between gap-3 flex-wrap"
          style={{ background: "#f59e0b22", border: "1px solid #f59e0b55" }}
        >
          <div className="text-xs" style={{ color: "#f59e0b" }}>
            💳 Há uma cobrança em aberto de <strong>{fmtMoeda(pendente.valor)}</strong>
            {pendente.vencimento && <> (vence {fmtData(pendente.vencimento)})</>}.
          </div>
          <a
            href={pendente.linkPagamento}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gp-white border-none rounded-lg px-4 py-2 font-bold text-xs no-underline whitespace-nowrap"
            style={{ background: "#f59e0b" }}
          >
            Pagar agora →
          </a>
        </div>
      )}

      {/* Aviso quando a cobranca online ainda nao esta habilitada (provedor mock). */}
      {podeAssinar && !cobrancaHabilitada && (
        <div
          className="mb-3 px-3 py-[10px] rounded-lg text-xs"
          style={{ background: C.accent + "1a", border: `1px solid ${C.accent}44`, color: C.text }}
        >
          💬 O pagamento online ainda não está habilitado. Para contratar ou mudar de plano,
          <strong> fale com o suporte</strong>.
        </div>
      )}

      {/* Catalogo de planos — so ADMIN contrata */}
      {podeAssinar && (
        <div
          className="grid gap-2 mb-1"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
        >
          {planos.map((p) => {
            const atual = info?.plano === p.plano && status === "ATIVA";
            return (
              <div
                key={p.plano}
                className="bg-gp-surface border border-gp-border rounded-[10px] px-3 py-[10px] flex flex-col gap-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-gp-white text-sm font-bold">{p.rotulo}</span>
                  <span className="text-gp-white text-sm font-extrabold">
                    {p.valorMensal ? `${fmtMoeda(p.valorMensal)}` : "Sob consulta"}
                  </span>
                </div>
                <div className="text-gp-muted text-[11px]" style={{ lineHeight: 1.4, minHeight: 30 }}>
                  {p.descricao}
                </div>
                {atual ? (
                  <div
                    className="rounded-lg px-3 py-2 text-center font-bold text-xs"
                    style={{ background: C.green + "22", color: C.green }}
                  >
                    ✓ Plano atual
                  </div>
                ) : (p.assinavel && cobrancaHabilitada) ? (
                  <button
                    type="button"
                    disabled={assinando !== null}
                    onClick={() => assinar(p.plano)}
                    className="text-gp-white border-none rounded-lg px-3 py-2 font-bold text-xs cursor-pointer"
                    style={{
                      background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                      opacity: assinando !== null ? 0.6 : 1,
                    }}
                  >
                    {assinando === p.plano ? "Processando..." : (info?.plano === p.plano ? "Renovar" : "Assinar")}
                  </button>
                ) : (
                  <div className="text-gp-muted text-[11px] text-center px-2 py-2">
                    {p.assinavel && !cobrancaHabilitada ? "Em breve" : "Fale com o suporte"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Historico de cobrancas */}
      {historico.length > 0 && (
        <details className="mt-2">
          <summary className="text-gp-muted text-[11px] font-bold uppercase tracking-[0.5px] cursor-pointer">
            Histórico de cobranças ({historico.length})
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {historico.map((c) => (
              <div
                key={c.id}
                className="bg-gp-surface border border-gp-border rounded-lg px-3 py-[6px] flex items-center justify-between gap-2 text-xs"
              >
                <span className="text-gp-text">{fmtData(c.criadaEm)}</span>
                <span className="text-gp-muted">{c.metodo || "—"}</span>
                <span className="text-gp-white font-bold">{fmtMoeda(c.valor)}</span>
                <span
                  className="font-bold"
                  style={{ color: STATUS_COBRANCA_COR[c.status] }}
                >
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {!podeAssinar && (
        <div className="mt-1 px-3 py-[6px] bg-gp-bg rounded-lg text-[11px] text-gp-muted">
          Apenas o administrador da empresa pode contratar ou alterar o plano.
        </div>
      )}
    </div>
  );
}

// ============ BLOCO CARDAPIO DIGITAL ============
// Liga/desliga o pedido online e mostra o link publico + QR Code para a loja
// imprimir/compartilhar. Pedidos caem na Central de Comandas.
function BlocoCardapio({ podeEditar }: { podeEditar: boolean }) {
  const [ativo, setAtivo] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function carregar() {
    try {
      const r = await api.cardapioStatus() as { ativo: boolean; token: string | null };
      setAtivo(r.ativo); setToken(r.token);
    } catch { /* sem permissao/modulo — bloco nao deveria aparecer */ }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  const url = token ? `${window.location.origin}/?cardapio=${token}` : "";

  async function alternar() {
    setSalvando(true);
    try {
      const r = await api.cardapioConfigurar({ ativo: !ativo }) as { ativo: boolean; token: string | null };
      setAtivo(r.ativo); setToken(r.token);
    } catch (e) { alert((e as Error).message); }
    finally { setSalvando(false); }
  }

  function copiar() {
    if (!url) return;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiado(true); setTimeout(() => setCopiado(false), 2000);
    });
  }

  if (carregando) return null;

  return (
    <div className="bg-gp-card border border-gp-border rounded-xl p-4 mb-3">
      <div className="flex justify-between items-start gap-3 flex-wrap mb-2">
        <div>
          <div className="text-gp-muted text-[11px] font-bold uppercase tracking-[0.5px]">Cardápio digital</div>
          <div className="text-gp-white text-sm font-bold mt-1">🍔 Pedido online</div>
          <div className="text-gp-muted text-xs mt-[2px]">
            Link público onde o cliente monta o pedido sozinho. Os pedidos caem na Central de Comandas.
          </div>
        </div>
        {podeEditar && (
          <button
            type="button"
            onClick={alternar}
            disabled={salvando}
            className="border-none rounded-lg px-4 py-2 font-bold text-xs cursor-pointer text-gp-white"
            style={{ background: ativo ? C.red : C.green, opacity: salvando ? 0.6 : 1 }}
          >
            {salvando ? "..." : ativo ? "Desativar" : "Ativar cardápio"}
          </button>
        )}
      </div>

      {ativo && token ? (
        <div className="bg-gp-surface border border-gp-border rounded-[10px] p-3 mt-2 flex gap-3 items-center flex-wrap">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(url)}`}
            alt="QR Code do cardápio"
            width={120} height={120}
            style={{ borderRadius: 8, background: "#fff", padding: 4 }}
          />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="text-gp-muted text-[10px] font-bold uppercase tracking-[0.5px] mb-1">Link público</div>
            <div className="text-gp-text text-xs break-all bg-gp-bg rounded-lg px-2 py-[6px] mb-2" style={{ fontFamily: "monospace" }}>{url}</div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={copiar} className="bg-gp-surface border border-gp-border rounded-lg px-3 py-[6px] text-xs font-bold cursor-pointer text-gp-text">
                {copiado ? "✓ Copiado" : "📋 Copiar link"}
              </button>
              <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg px-3 py-[6px] text-xs font-bold no-underline" style={{ background: C.accent, color: "var(--accent-ink)" }}>
                Abrir cardápio →
              </a>
            </div>
            <div className="text-gp-muted text-[10px] mt-2">Imprima o QR Code e coloque nas mesas / balcão, ou compartilhe o link no WhatsApp e redes.</div>
          </div>
        </div>
      ) : (
        <div className="text-gp-muted text-xs mt-2 px-3 py-2 bg-gp-bg rounded-lg">
          {ativo ? "Gerando link..." : "Cardápio desativado. Ative para gerar o link público de pedidos."}
        </div>
      )}
    </div>
  );
}

// ============ BLOCO DISPOSITIVOS / MAQUINAS CONECTADAS ============
// Autogestao da licenca por maquina pelo proprio lojista (ADMIN/GERENTE):
// ve as maquinas conectadas, renomeia (apelido) e desconecta as que quiser.
// O dispositivo da sessao atual vem marcado com `atual` para avisar antes de
// a pessoa se auto-desconectar.
interface DispositivoItem {
  id: string;
  nome?: string | null;
  ultimoAcessoEm?: string | null;
  ultimoIp?: string | null;
  ativo: boolean;
  atual?: boolean;
}
interface DispositivosResp {
  limite: number | null;        // null = ilimitado
  ativos: number;
  dispositivos: DispositivoItem[];
}

function BlocoDispositivos({ podeEditar }: { podeEditar: boolean }) {
  const [dados, setDados] = useState<DispositivosResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [acaoId, setAcaoId] = useState<string | null>(null);

  async function carregar() {
    try {
      const r = await api.empresaListarDispositivos() as DispositivosResp;
      setDados(r);
    } catch { /* sem permissao — bloco fica discreto */ }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  async function revogar(d: DispositivoItem) {
    const msg = d.atual
      ? "Este é o dispositivo que você está usando agora. Ao desconectar, você será deslogado. Continuar?"
      : "Desconectar esta máquina? Ela cairá para o login no próximo acesso.";
    if (!confirm(msg)) return;
    setAcaoId(d.id);
    try {
      await api.empresaRevogarDispositivo(d.id);
      // Se derrubou a propria sessao, o heartbeat/proxima request desloga sozinho.
      await carregar();
    } catch (e) { alert((e as Error).message); }
    finally { setAcaoId(null); }
  }

  async function renomear(d: DispositivoItem) {
    const nome = prompt("Apelido da máquina (ex: PC do balcão, Notebook gerente):", d.nome || "");
    if (nome == null || !nome.trim()) return;
    setAcaoId(d.id);
    try {
      await api.empresaRenomearDispositivo(d.id, nome.trim());
      await carregar();
    } catch (e) { alert((e as Error).message); }
    finally { setAcaoId(null); }
  }

  if (carregando || !dados) return null;

  const ativos = dados.dispositivos.filter(d => d.ativo);
  const limiteTxt = dados.limite == null ? "ilimitado" : `${dados.ativos} de ${dados.limite}`;
  const noLimite = dados.limite != null && dados.ativos >= dados.limite;

  return (
    <div className="bg-gp-card border border-gp-border rounded-xl p-4 mb-3">
      <div className="flex justify-between items-start gap-3 flex-wrap mb-3">
        <div>
          <div className="text-gp-muted text-[11px] font-bold uppercase tracking-[0.5px]">Máquinas conectadas</div>
          <div className="text-gp-white text-sm font-bold mt-1">🖥️ Dispositivos com acesso</div>
          <div className="text-gp-muted text-xs mt-[2px]">
            Computadores/navegadores com sessão ativa nesta conta. Desconecte os que não usa mais para liberar vaga.
          </div>
        </div>
        <span
          className="rounded-lg px-3 py-1.5 text-xs font-bold"
          style={{
            background: (noLimite ? C.red : C.green) + "22",
            color: noLimite ? C.red : C.green,
            border: `1px solid ${(noLimite ? C.red : C.green)}55`,
          }}
        >
          {limiteTxt}{noLimite ? " · no limite" : ""}
        </span>
      </div>

      {ativos.length === 0 ? (
        <div className="text-gp-muted text-xs">Nenhuma máquina ativa registrada.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {ativos.map((d) => (
            <div key={d.id}
              className="flex items-center gap-3 rounded-lg border border-gp-border p-2.5"
              style={{ background: C.surface }}>
              <span className="text-base">🖥️</span>
              <div className="min-w-0 flex-1">
                <div className="text-gp-white text-[13px] font-semibold truncate flex items-center gap-2">
                  {d.nome || "Dispositivo"}
                  {d.atual && (
                    <span className="text-[9px] font-bold rounded px-1.5 py-[1px]"
                      style={{ background: C.accent + "22", color: C.accent }}>ESTE</span>
                  )}
                </div>
                <div className="text-gp-muted text-[11px] truncate">
                  {d.ultimoAcessoEm ? `Último acesso ${fmtData(d.ultimoAcessoEm)}` : "—"}
                  {d.ultimoIp ? ` · ${d.ultimoIp}` : ""}
                </div>
              </div>
              {podeEditar && (
                <div className="flex gap-1.5 shrink-0">
                  <button type="button" onClick={() => renomear(d)} disabled={acaoId !== null}
                    className="rounded-md px-2.5 py-1.5 text-[11px] font-bold cursor-pointer"
                    style={{ background: C.surface, color: C.muted, border: `1px solid ${C.border}` }}>
                    Renomear
                  </button>
                  <button type="button" onClick={() => revogar(d)} disabled={acaoId !== null}
                    className="rounded-md px-2.5 py-1.5 text-[11px] font-bold cursor-pointer"
                    style={{ background: C.red + "22", color: C.red, border: `1px solid ${C.red}55` }}>
                    {acaoId === d.id ? "..." : "Desconectar"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ BLOCO PREFERENCIAS LOCAIS (per-browser) ============
// Hoje so' tem o flag de avisos de servidor (tarja + toasts automaticos
// de NETWORK/TIMEOUT/5xx). Erros 4xx continuam aparecendo via try/catch
// das telas. A preferencia e' por dispositivo (localStorage) — nao
// sincroniza com o backend nem se aplica a outros usuarios do tenant.
function BlocoPreferenciasUI() {
  const [avisosRede, setAvisosRede] = useState<boolean>(() => getAvisosRedeAtivos());

  function alternar() {
    const novo = !avisosRede;
    setAvisosRede(novo);
    setAvisosRedeAtivos(novo);
  }

  return (
    <div className="bg-gp-card border border-gp-border rounded-xl p-4">
      <div className="text-gp-muted text-[11px] font-bold uppercase tracking-[0.5px] mb-3">
        Preferencias deste dispositivo
      </div>

      <div
        className="bg-gp-surface border border-gp-border rounded-[10px] p-3"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-gp-white text-sm font-bold">
            📡 Avisos de conexao com o servidor
          </div>
          <div className="text-gp-muted text-xs mt-1" style={{ lineHeight: 1.45 }}>
            Quando ligado, mostra a tarja vermelha/amarela no topo e os toasts de
            "sem conexao" / "servidor instavel". Desligue se preferir uma tela mais
            limpa — mensagens de erro especificas das telas continuam aparecendo.
          </div>
          <div className="text-gp-muted text-[11px] mt-2" style={{ opacity: 0.7 }}>
            Vale so neste navegador / dispositivo.
          </div>
        </div>

        <button
          type="button"
          onClick={alternar}
          role="switch"
          aria-checked={avisosRede ? "true" : "false"}
          aria-label="Mostrar avisos de conexao com o servidor"
          style={{
            position: "relative",
            width: 52,
            height: 28,
            borderRadius: 999,
            border: `1px solid ${avisosRede ? C.green : C.border}`,
            background: avisosRede ? C.green : C.bg,
            cursor: "pointer",
            transition: "background 150ms, border-color 150ms",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: avisosRede ? 26 : 2,
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "#ffffff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              transition: "left 150ms",
            }}
          />
        </button>
      </div>

      <div className="text-gp-muted text-[11px] mt-2 px-1" style={{ opacity: 0.75 }}>
        Status atual: <strong style={{ color: avisosRede ? C.green : C.muted }}>
          {avisosRede ? "Avisos ligados" : "Avisos desligados"}
        </strong>
      </div>
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: "block",
  color: C.muted,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 4,
};

const inputStyle: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  color: C.text,
  fontSize: 13,
  outline: "none",
  width: "100%",
};
