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
import { api, setSession, getToken, getUser, type SessionUser, type SessionEmpresa } from "./lib/api";
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

  const stats: { rotulo: string; valor: number; cor: string }[] = [
    { rotulo: "Usuários", valor: dados.estatisticas?.usuarios ?? 0, cor: C.accent },
    { rotulo: "Clientes", valor: dados.estatisticas?.clientes ?? 0, cor: C.green },
    { rotulo: "Produtos", valor: dados.estatisticas?.produtos ?? 0, cor: C.purple },
    { rotulo: "Vendas", valor: dados.estatisticas?.vendas ?? 0, cor: C.yellow },
  ];

  return (
    <div>
      {/* ============ BLOCO 1: IDENTIDADE DO TENANT ============ */}
      <div className="bg-gp-card border border-gp-border rounded-xl p-5 mb-5">
        <div className="flex justify-between items-start flex-wrap gap-3 mb-4">
          <div>
            <div className="text-gp-muted text-[11px] font-bold uppercase tracking-[0.5px]">
              Identidade da empresa
            </div>
            <div className="text-gp-white text-2xl font-extrabold mt-1">{dados.nome}</div>
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
            className="bg-gp-surface border border-gp-border rounded-[10px] p-4 mb-4"
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

        {/* Estatisticas */}
        <div
          className="grid gap-[10px] mt-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}
        >
          {stats.map((s, i) => (
            <div
              key={i}
              className="bg-gp-surface border border-gp-border rounded-[10px] px-[14px] py-3 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-1 h-full" style={{ background: s.cor }} />
              <div className="text-gp-muted text-[10px] font-bold uppercase tracking-[0.5px]">
                {s.rotulo}
              </div>
              <div className="text-[22px] font-extrabold mt-1" style={{ color: s.cor }}>
                {fmtNum(s.valor)}
              </div>
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

      {/* ============ BLOCO 3: DADOS FISCAIS (CONFIGURACAO EMPRESA) ============ */}
      <div className="bg-gp-card border border-gp-border rounded-xl p-1 mb-5">
        <div className="px-4 py-3 border-b border-gp-border">
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
    <div className="bg-gp-card border border-gp-border rounded-xl p-5 mb-5">
      <div className="flex justify-between items-start flex-wrap gap-3 mb-4">
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
              className="bg-gp-surface border border-gp-border rounded-[10px] px-[14px] py-3"
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

      <div className="mt-3 px-3 py-2 bg-gp-bg rounded-lg text-[11px] text-gp-muted">
        Para alterar o plano ou ampliar limites, entre em contato com o suporte.
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
