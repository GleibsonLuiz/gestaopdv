// Signup.tsx — tela publica de cadastro de nova empresa (tenant).
//
// Acessada via link "Criar empresa" no Login. Apos signup bem-sucedido,
// chama setSession() e onSuccess(user) — mesma assinatura do Login pra
// reaproveitar o fluxo de auto-login.

import { useState, type FormEvent } from "react";
import { api, setSession, type SessionUser } from "./lib/api";

type IconProps = { size?: number };

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
const Building = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="3" width="16" height="18" rx="1" />
    <path d="M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />
  </svg>
);
const Id = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <circle cx="9" cy="12" r="2.2" /><path d="M14 10h4M14 14h3" />
  </svg>
);
const User = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
  </svg>
);
const Eye = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOff = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3l18 18" /><path d="M10.6 6.2A10.3 10.3 0 0 1 12 6c6.5 0 10 6 10 6a17.4 17.4 0 0 1-3.1 3.9" />
    <path d="M6.6 6.6C3.6 8.4 2 12 2 12s3.5 7 10 7a10.3 10.3 0 0 0 4.4-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
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
const ArrowBack = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5" /><path d="M11 18l-6-6 6-6" />
  </svg>
);

function DefaultMark({ size = 44 }: IconProps) {
  return (
    <span className="inline-flex items-center justify-center" style={{
      width: size, height: size, borderRadius: size * 0.27,
      background: "linear-gradient(135deg,#8b5cf6 0%,#6366f1 60%,#60a5fa 120%)",
      boxShadow: "0 8px 24px -8px rgba(139,92,246,.6)",
    }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 18 18">
        <rect x="2" y="11" width="3" height="5" rx="1" fill="#0a0c14" />
        <rect x="7.5" y="7" width="3" height="9" rx="1" fill="#0a0c14" />
        <rect x="13" y="3" width="3" height="13" rx="1" fill="#0a0c14" />
      </svg>
    </span>
  );
}

// Mascara CNPJ visual XX.XXX.XXX/XXXX-XX. Backend valida apenas digitos.
function mascararCnpj(v: string): string {
  const d = String(v || "").replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

type SignupStatus = "idle" | "loading" | "error" | "success";

type CampoSignup = "nomeEmpresa" | "cnpj" | "nomeAdmin" | "email" | "senha";

type Touched = Partial<Record<CampoSignup, boolean>>;

interface SignupResponse {
  token: string;
  user: SessionUser;
  empresa: { id: string; nome: string; cnpj?: string } | null;
}

interface SignupProps {
  onSuccess?: (user: SessionUser) => void;
  onVoltarLogin?: () => void;
}

export default function Signup({ onSuccess, onVoltarLogin }: SignupProps) {
  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [nomeAdmin, setNomeAdmin] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState<Touched>({});
  const [status, setStatus] = useState<SignupStatus>("idle");
  const [err, setErr] = useState("");

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const senhaValid = senha.length >= 6;
  const nomeEmpresaValid = nomeEmpresa.trim().length >= 3;
  const nomeAdminValid = nomeAdmin.trim().length >= 3;
  const cnpjDigitos = cnpj.replace(/\D/g, "");
  const cnpjValid = cnpjDigitos === "" || cnpjDigitos.length === 14;
  const formValid = emailValid && senhaValid && nomeEmpresaValid && nomeAdminValid && cnpjValid;

  function showErr(campo: CampoSignup, condicao: boolean): boolean {
    return !!touched[campo] && condicao;
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTouched({ nomeEmpresa: true, cnpj: true, nomeAdmin: true, email: true, senha: true });
    if (!formValid) return;
    setStatus("loading");
    setErr("");
    try {
      const { token, user, empresa } = await api.signup({
        nomeEmpresa: nomeEmpresa.trim(),
        cnpj: cnpjDigitos || undefined,
        nomeAdmin: nomeAdmin.trim(),
        email: email.trim().toLowerCase(),
        senha,
      }) as SignupResponse;
      setSession(token, user, empresa);
      setStatus("success");
      onSuccess?.(user);
    } catch (e2) {
      setStatus("error");
      setErr((e2 as Error)?.message || "Nao foi possivel criar a empresa.");
    }
  };

  return (
    <div className="min-h-screen w-full bg-ink-950 text-white grid grid-cols-1 lg:grid-cols-[1.1fr_minmax(440px,520px)] overflow-hidden font-sans">
      {/* Painel esquerdo — branding simples (sem quotes pra economizar atencao do user no signup) */}
      <aside className="relative hidden lg:flex flex-col justify-between p-10 xl:p-14 overflow-hidden border-r border-line">
        <div className="blob animate-mesh-1" style={{ width: 520, height: 520, background: "#8b5cf6", top: -120, left: -100, opacity: .35 }} />
        <div className="blob animate-mesh-2" style={{ width: 480, height: 480, background: "#6366f1", top: "38%", right: -120, opacity: .28 }} />
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
          <div className="text-[11px] font-mono tracking-[0.12em] uppercase text-mist-400 mb-3">
            Sua empresa · Seu controle
          </div>
          <h2 className="font-display text-[40px] xl:text-[48px] leading-[1.08] tracking-tight m-0">
            Cadastre sua empresa em <span className="text-brand-violet">menos de um minuto</span>.
          </h2>
          <p className="mt-6 text-mist-300 text-[15px] leading-relaxed">
            CRM, PDV, controle financeiro, gestão de estoque e relatórios profissionais — tudo em um só sistema, isolado por empresa.
          </p>
        </div>

        <div className="relative z-10 flex items-center justify-between text-[12px] text-mist-400 font-mono">
          <span className="flex items-center gap-2"><span className="pulse-dot" /> sistemas operacionais</span>
          <span>v4.12 · build 2026.05</span>
        </div>
      </aside>

      {/* Painel direito — form de cadastro */}
      <main className="relative flex flex-col bg-ink-900">
        <div className="lg:hidden flex items-center gap-3 p-6 border-b border-line">
          <DefaultMark size={36} />
          <div className="text-[14px] font-medium">
            Gestão<span className="font-semibold">Pro</span><span className="gp-brand-max">Max</span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 lg:px-12 py-8">
          <form onSubmit={submit} className="w-full max-w-[420px] animate-fade-up" style={{ animationDelay: ".15s" }}>
            <button
              type="button"
              onClick={onVoltarLogin}
              className="inline-flex items-center gap-2 text-[12px] text-mist-400 hover:text-mist-200 mb-6 font-mono"
            >
              <ArrowBack size={14} /> Voltar ao login
            </button>

            <div className="mb-7">
              <div className="text-[11px] font-mono tracking-[0.12em] uppercase text-mist-400 mb-3">
                Nova empresa · Cadastro
              </div>
              <h1 className="font-display text-[36px] leading-[1.05] tracking-tight m-0">
                Vamos criar sua conta.
              </h1>
              <p className="mt-2 text-mist-300 text-[14px] leading-relaxed">
                Sua empresa terá seu próprio espaço, isolado dos outros tenants.
              </p>
            </div>

            {status === "error" && (
              <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">
                <span className="mt-0.5"><Alert size={14} /></span>
                <span>{err}</span>
              </div>
            )}

            {/* Empresa */}
            <div className="text-[10px] font-mono tracking-[0.12em] uppercase text-mist-400 mb-2 mt-2">
              Dados da empresa
            </div>

            <div className={`field mb-3 ${showErr("nomeEmpresa", !nomeEmpresaValid) ? "invalid" : ""}`}>
              <span className="lead"><Building /></span>
              <input
                id="nomeEmpresa" type="text" placeholder=" "
                className="with-icon" value={nomeEmpresa}
                onChange={(e) => setNomeEmpresa(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, nomeEmpresa: true }))}
                maxLength={120}
              />
              <label htmlFor="nomeEmpresa">Nome da empresa</label>
            </div>

            <div className={`field mb-4 ${showErr("cnpj", !cnpjValid) ? "invalid" : ""}`}>
              <span className="lead"><Id /></span>
              <input
                id="cnpj" type="text" placeholder=" "
                className="with-icon" value={cnpj}
                onChange={(e) => setCnpj(mascararCnpj(e.target.value))}
                onBlur={() => setTouched((t) => ({ ...t, cnpj: true }))}
                inputMode="numeric"
              />
              <label htmlFor="cnpj">CNPJ (opcional)</label>
            </div>

            {/* Admin */}
            <div className="text-[10px] font-mono tracking-[0.12em] uppercase text-mist-400 mb-2 mt-2">
              Administrador
            </div>

            <div className={`field mb-3 ${showErr("nomeAdmin", !nomeAdminValid) ? "invalid" : ""}`}>
              <span className="lead"><User /></span>
              <input
                id="nomeAdmin" type="text" placeholder=" "
                className="with-icon" value={nomeAdmin}
                onChange={(e) => setNomeAdmin(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, nomeAdmin: true }))}
                maxLength={120}
              />
              <label htmlFor="nomeAdmin">Seu nome</label>
            </div>

            <div className={`field mb-3 ${showErr("email", !emailValid) ? "invalid" : ""}`}>
              <span className="lead"><Mail /></span>
              <input
                id="email" type="email" placeholder=" " autoComplete="email"
                className="with-icon" value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              />
              <label htmlFor="email">Email</label>
            </div>

            <div className={`field mb-2 ${showErr("senha", !senhaValid) ? "invalid" : ""}`}>
              <span className="lead"><Lock /></span>
              <input
                id="senha" type={showPw ? "text" : "password"} placeholder=" "
                className="with-icon with-trail" value={senha}
                onChange={(e) => setSenha(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, senha: true }))}
                autoComplete="new-password"
              />
              <label htmlFor="senha">Senha (mínimo 6 caracteres)</label>
              <button type="button" className="trail" aria-label={showPw ? "Esconder senha" : "Mostrar senha"} onClick={() => setShowPw((v) => !v)}>
                {showPw ? <EyeOff /> : <Eye />}
              </button>
            </div>

            <button type="submit" className="btn-primary mt-5" disabled={status === "loading" || status === "success"}>
              {status === "loading" && (<><span className="spinner" /><span>Criando empresa...</span></>)}
              {status === "success" && (<><Check size={20} /><span>Empresa criada</span></>)}
              {status !== "loading" && status !== "success" && (<><span>Criar empresa</span><Arrow size={16} /></>)}
            </button>

            <div className="mt-6 flex items-center justify-between text-[11px] font-mono text-mist-500">
              <span>SOC 2 · LGPD</span>
              <span>© GestãoProMax 2026</span>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
