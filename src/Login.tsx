// Login.tsx — tela de login com painel de citacoes + form moderno.
// Requer Tailwind CSS configurado e src/styles/login.css importado no main.tsx.

import { useState, useEffect, type FormEvent } from "react";
import { api, setSession, ApiError, type SessionUser } from "./lib/api";

interface Quote {
  text: string;
  author: string;
}

const QUOTES: Quote[] = [
  { text: "Vender é a arte de transferir entusiasmo de uma pessoa para outra.", author: "Walter H. Cottingham" },
  { text: "O que não pode ser medido não pode ser gerenciado.", author: "Peter Drucker" },
  { text: "O cliente não compra um produto — compra a solução para um problema.", author: "Theodore Levitt" },
  { text: "Você não constrói um negócio. Você constrói pessoas, e pessoas constroem o negócio.", author: "Zig Ziglar" },
  { text: "A melhor forma de prever o futuro é criá-lo.", author: "Peter Drucker" },
];

type IconProps = { size?: number };

// ─── Icons (inline SVG — sem dependência) ──────────────────────────────────
const Mail = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 7l9 6 9-6" />
  </svg>
);
const Lock = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4.5" y="11" width="15" height="9" rx="2.5" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
  </svg>
);
const Eye = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOff = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3l18 18" />
    <path d="M10.6 6.2A10.3 10.3 0 0 1 12 6c6.5 0 10 6 10 6a17.4 17.4 0 0 1-3.1 3.9" />
    <path d="M6.6 6.6C3.6 8.4 2 12 2 12s3.5 7 10 7a10.3 10.3 0 0 0 4.4-1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);
const Alert = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><circle cx="12" cy="16" r=".5" fill="currentColor" />
  </svg>
);
const Check = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12l5 5L20 7" />
  </svg>
);
const Arrow = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
  </svg>
);
const QuoteIcon = ({ size = 28 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor">
    <path d="M11 8c-3.3 0-6 2.7-6 6v10h8V14h-3c0-1.7 1.3-3 3-3V8zm14 0c-3.3 0-6 2.7-6 6v10h8V14h-3c0-1.7 1.3-3 3-3V8z" />
  </svg>
);

function DefaultMark({ size = 44 }: IconProps) {
  return (
    <span
      className="inline-flex items-center justify-center"
      style={{
        width: size, height: size, borderRadius: size * 0.27,
        background: "linear-gradient(135deg,#8b5cf6 0%,#6366f1 60%,#60a5fa 120%)",
        boxShadow: "0 8px 24px -8px rgba(139,92,246,.6)",
      }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 18 18">
        <rect x="2" y="11" width="3" height="5" rx="1" fill="#0a0c14" />
        <rect x="7.5" y="7" width="3" height="9" rx="1" fill="#0a0c14" />
        <rect x="13" y="3" width="3" height="13" rx="1" fill="#0a0c14" />
      </svg>
    </span>
  );
}

interface LoginProps {
  onSuccess?: (user: SessionUser) => void;
}

interface LoginResponse {
  token: string;
  user: SessionUser;
  empresa: { id: string; nome: string; cnpj?: string } | null;
}

type LoginStatus = "idle" | "loading" | "error" | "success";

// Dispositivo retornado pelo backend na tela de bloqueio (licenca por maquina).
interface DispositivoBloqueio {
  id: string;
  nome?: string | null;
  ultimoAcessoEm?: string | null;
  ultimoIp?: string | null;
}

interface LoginErrorData {
  motivoSuspensao?: string;
  planoExpirado?: boolean;
  // Licenca por maquina: limite de dispositivos atingido.
  dispositivoBloqueado?: boolean;
  max?: number;
  dispositivos?: DispositivoBloqueio[];
}

interface BloqueioState {
  max: number;
  dispositivos: DispositivoBloqueio[];
}

// "há 3 dias", "agora" — rotulo relativo amigavel para o ultimo acesso.
function tempoRelativo(iso?: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

// ─── Página ────────────────────────────────────────────────────────────────
export default function Login({ onSuccess }: LoginProps) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [, setRemember]         = useState(true);
  const [touched, setTouched]   = useState<{ email: boolean; password: boolean }>({ email: false, password: false });
  const [status, setStatus]     = useState<LoginStatus>("idle");
  const [err, setErr]           = useState("");
  const [quoteIdx, setQuoteIdx] = useState(0);
  // Licenca por maquina: quando o login e recusado por limite de dispositivos,
  // guardamos a lista para o cliente derrubar uma maquina antiga (self-service).
  const [bloqueio, setBloqueio]   = useState<BloqueioState | null>(null);
  const [revogandoId, setRevogandoId] = useState<string | null>(null);

  // Silencia "unused" do setter — feature de "lembrar-me" virá depois.
  void setRemember;

  const emailValid    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordValid = password.length >= 6;
  const formValid     = emailValid && passwordValid;
  const showEmailErr  = touched.email    && email.length    > 0 && !emailValid;
  const showPwErr     = touched.password && password.length > 0 && !passwordValid;

  useEffect(() => {
    const id = setInterval(() => setQuoteIdx((i) => (i + 1) % QUOTES.length), 7000);
    return () => clearInterval(id);
  }, []);

  // Tentativa de login reutilizavel (form + retry pos-revogacao de dispositivo).
  const tentarLogin = async () => {
    setStatus("loading");
    setErr("");
    try {
      // Backend (ETAPA 2 multi-tenant) retorna { token, user, empresa }.
      // user.tenantId duplica empresa.id mas mantemos para conveniencia.
      const { token, user, empresa } = await api.login(email, password) as LoginResponse;
      setSession(token, user, empresa);
      setBloqueio(null);
      setStatus("success");
      onSuccess?.(user);
    } catch (e2) {
      setStatus("error");
      const data = (e2 instanceof ApiError ? e2.data : null) as LoginErrorData | null;
      // Licenca por maquina: limite atingido — mostra a tela de bloqueio com
      // as maquinas ativas para o cliente desconectar uma.
      if (data?.dispositivoBloqueado) {
        setBloqueio({ max: data.max || 0, dispositivos: data.dispositivos || [] });
        return;
      }
      // ETAPA 11: motivoSuspensao (empresa desativada).
      // ETAPA 12: planoExpirado (plano vencido).
      const motivo = data?.motivoSuspensao;
      if (motivo) {
        setErr(`⏸ Conta suspensa: ${motivo}`);
      } else if (data?.planoExpirado) {
        setErr(`🎫 ${(e2 as Error).message}`);
      } else {
        setErr((e2 as Error)?.message || "Nao conseguimos validar essas credenciais.");
      }
    }
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!formValid) return;
    await tentarLogin();
  };

  // Desconecta uma maquina antiga (re-valida email+senha no backend) e, em
  // seguida, refaz o login automaticamente neste dispositivo.
  const revogarERetentar = async (dispId: string) => {
    setRevogandoId(dispId);
    setErr("");
    try {
      await api.revogarDispositivoSelfService(email, password, dispId);
      setBloqueio(null);
      await tentarLogin();
    } catch (e2) {
      setErr((e2 as Error)?.message || "Nao foi possivel desconectar este dispositivo.");
    } finally {
      setRevogandoId(null);
    }
  };

  // ETAPA 10: signup publico foi REMOVIDO. Apenas o super-admin do sistema
  // pode criar novas empresas (via /admin-master). O componente Signup.jsx
  // continua existindo para reuso eventual, mas nao e mais acessivel pela
  // tela de Login normal.

  return (
    <div className="min-h-screen w-full bg-ink-950 text-white grid grid-cols-1 lg:grid-cols-[1.1fr_minmax(440px,520px)] overflow-hidden font-sans">

      {/* ─── ESQUERDA — quote panel ──────────────────────────────────── */}
      <aside className="relative hidden lg:flex flex-col justify-between p-10 xl:p-14 overflow-hidden border-r border-line">
        <div className="blob animate-mesh-1" style={{ width: 520, height: 520, background: "#8b5cf6", top: -120, left: -100, opacity: .35 }} />
        <div className="blob animate-mesh-2" style={{ width: 480, height: 480, background: "#6366f1", top: "38%", right: -120, opacity: .28 }} />
        <div className="blob animate-mesh-3" style={{ width: 420, height: 420, background: "#e879f9", bottom: -160, left: "30%", opacity: .18 }} />
        <div className="grain" />

        <div className="relative z-10 flex items-center gap-3 animate-fade-up">
          <DefaultMark size={44} />
          <div className="leading-tight">
            <div className="text-[15px] font-medium tracking-tight">
              Gestão<span className="font-semibold">Pro</span><span className="gp-brand-max">Max</span>
            </div>
            <div className="text-[11px] text-mist-400 font-mono tracking-wider uppercase">CRM · PDV</div>
          </div>
        </div>

        <div className="relative z-10 max-w-xl animate-fade-up" style={{ animationDelay: ".1s" }}>
          <span className="text-brand-violet/70"><QuoteIcon /></span>
          <div className="quote-stack mt-6">
            {QUOTES.map((q, i) => (
              <div key={i} className={`quote-item ${i === quoteIdx ? "is-active" : ""}`}>
                <p className="font-display text-[40px] xl:text-[48px] leading-[1.08] tracking-tight">
                  {q.text}
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <span className="h-px w-8 bg-mist-400/60" />
                  <span className="text-mist-300 text-sm tracking-wide">{q.author}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex items-center gap-2">
            {QUOTES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setQuoteIdx(i)}
                aria-label={`Ir para citacao ${i + 1}`}
                className={`h-[3px] rounded-full transition-all duration-500 ${
                  i === quoteIdx ? "w-10 bg-brand-violet" : "w-5 bg-mist-500/40 hover:bg-mist-400/60"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-[12px] text-mist-400 font-mono">
          <span className="flex items-center gap-2"><span className="pulse-dot" /> sistemas operacionais</span>
          <span>v4.12 · build 2026.05</span>
        </div>
      </aside>

      {/* ─── DIREITA — form ─────────────────────────────────────────── */}
      <main className="relative flex flex-col bg-ink-900">
        <div className="lg:hidden flex items-center gap-3 p-6 border-b border-line">
          <DefaultMark size={36} />
          <div className="text-[14px] font-medium">
            Gestão<span className="font-semibold">Pro</span><span className="gp-brand-max">Max</span>
          </div>
        </div>



        <div className="flex-1 flex items-center justify-center px-6 lg:px-12 py-8">
          {bloqueio ? (
            <BloqueioDispositivos
              bloqueio={bloqueio}
              revogandoId={revogandoId}
              erro={err}
              onRevogar={revogarERetentar}
              onVoltar={() => { setBloqueio(null); setStatus("idle"); setErr(""); }}
            />
          ) : (
          <form onSubmit={submit} className="w-full max-w-[400px] animate-fade-up" style={{ animationDelay: ".15s" }}>

            <div className="mb-8">
              <div className="text-[11px] font-mono tracking-[0.12em] uppercase text-mist-400 mb-3">
                Acesso · Painel
              </div>
              <h1 className="font-display text-[40px] leading-[1.05] tracking-tight m-0">
                Bem-vindo de volta.
              </h1>
              <p className="mt-2 text-mist-300 text-[14px] leading-relaxed">
                Faça login para acessar seu CRM e o ponto de venda.
              </p>
            </div>

            {status === "error" && (
              <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">
                <span className="mt-0.5"><Alert size={14} /></span>
                <span>{err}</span>
              </div>
            )}

            <div className={`field mb-4 ${showEmailErr ? "invalid" : ""}`}>
              <span className="lead"><Mail /></span>
              <input
                id="email" type="email" placeholder=" " autoComplete="email"
                className="with-icon"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              />
              <label htmlFor="email">Email</label>
            </div>
            {showEmailErr && (
              <div className="-mt-2 mb-3 flex items-center gap-1.5 text-[12px] text-red-300">
                <Alert size={12} /> Insira um email válido.
              </div>
            )}

            <div className={`field mb-2 ${showPwErr ? "invalid" : ""}`}>
              <span className="lead"><Lock /></span>
              <input
                id="password" type={showPw ? "text" : "password"} placeholder=" " autoComplete="current-password"
                className="with-icon with-trail"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              />
              <label htmlFor="password">Senha</label>
              <button type="button" className="trail" aria-label={showPw ? "Esconder senha" : "Mostrar senha"} onClick={() => setShowPw((v) => !v)}>
                {showPw ? <EyeOff /> : <Eye />}
              </button>
            </div>
            {showPwErr && (
              <div className="mb-3 flex items-center gap-1.5 text-[12px] text-red-300">
                <Alert size={12} /> Mínimo de 6 caracteres.
              </div>
            )}



            <button type="submit" className="btn-primary" disabled={status === "loading" || status === "success"}>
              {status === "loading" && (<><span className="spinner" /><span>Entrando...</span></>)}
              {status === "success" && (<><Check size={20} /><span>Acesso liberado</span></>)}
              {status !== "loading" && status !== "success" && (<><span>Entrar</span><Arrow size={16} /></>)}
            </button>

            <div className="mt-6 flex items-center justify-between text-[11px] font-mono text-mist-500">
              <span>SOC 2 · LGPD</span>
              <span>© GestãoProMax 2026</span>
            </div>

            <div className="mt-3 text-center">
              <a
                href="/admin-master"
                className="text-[10px] font-mono text-mist-500 hover:text-violet-400 transition-colors"
                style={{ textDecoration: "none", letterSpacing: "0.05em" }}
              >
                · acesso administrativo ·
              </a>
            </div>
          </form>
          )}
        </div>

        <div className="lg:hidden px-6 pb-8 pt-2 text-center">
          <p className="font-display text-[20px] leading-snug text-mist-200 m-0">"{QUOTES[quoteIdx].text}"</p>
          <p className="mt-2 text-[12px] text-mist-400">— {QUOTES[quoteIdx].author}</p>
        </div>
      </main>
    </div>
  );
}

// ─── Tela de bloqueio por limite de maquinas (licenca por dispositivo) ──────
const Monitor = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" />
  </svg>
);

interface BloqueioProps {
  bloqueio: BloqueioState;
  revogandoId: string | null;
  erro: string;
  onRevogar: (id: string) => void;
  onVoltar: () => void;
}

function BloqueioDispositivos({ bloqueio, revogandoId, erro, onRevogar, onVoltar }: BloqueioProps) {
  return (
    <div className="w-full max-w-[440px] animate-fade-up">
      <div className="mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-300 mb-4">
          <Lock size={22} />
        </div>
        <div className="text-[11px] font-mono tracking-[0.12em] uppercase text-mist-400 mb-2">
          Limite de dispositivos
        </div>
        <h1 className="font-display text-[30px] leading-[1.1] tracking-tight m-0">
          Esta conta já está em uso.
        </h1>
        <p className="mt-3 text-mist-300 text-[14px] leading-relaxed">
          Seu plano permite <strong className="text-white">{bloqueio.max}</strong>{" "}
          {bloqueio.max === 1 ? "máquina conectada" : "máquinas conectadas"} ao mesmo tempo.
          Para entrar aqui, desconecte um dos dispositivos abaixo.
        </p>
      </div>

      {erro && (
        <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">
          <span className="mt-0.5"><Alert size={14} /></span>
          <span>{erro}</span>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {bloqueio.dispositivos.map((d) => {
          const ocupado = revogandoId !== null;
          const estaRevogando = revogandoId === d.id;
          return (
            <div
              key={d.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] px-3.5 py-3"
            >
              <span className="shrink-0 text-mist-300"><Monitor size={20} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] text-white truncate">{d.nome || "Dispositivo"}</div>
                <div className="text-[12px] text-mist-400 truncate">
                  Último acesso {tempoRelativo(d.ultimoAcessoEm)}
                  {d.ultimoIp ? ` · ${d.ultimoIp}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRevogar(d.id)}
                disabled={ocupado}
                className="shrink-0 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50 px-3 py-1.5 text-[12px] font-medium transition-colors"
              >
                {estaRevogando ? "Desconectando…" : "Desconectar"}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[12px] text-mist-500 leading-relaxed">
        Ao desconectar, a outra máquina será deslogada e você entrará automaticamente neste dispositivo.
      </p>

      <button
        type="button"
        onClick={onVoltar}
        className="mt-5 text-[13px] text-mist-400 hover:text-white transition-colors"
      >
        ← Voltar ao login
      </button>
    </div>
  );
}
