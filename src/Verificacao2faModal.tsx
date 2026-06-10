import { useEffect, useState, type ReactNode } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";

// ============ VERIFICACAO EM DUAS ETAPAS (2FA TOTP) ============
// Self-service do usuario logado, acessivel no menu do avatar (ao lado de
// "Trocar senha"). Fluxo de ativacao em 2 passos para nunca causar lockout:
// 1) backend gera segredo + QR (totpAtivo continua false);
// 2) usuario escaneia no app autenticador e PROVA um codigo valido — so
//    entao o gate do login passa a exigir o codigo.
// Desativar pede a SENHA (quem perdeu o celular mas esta logado se recupera
// sozinho; quem perdeu celular E sessao aciona o suporte).

interface Verificacao2faModalProps {
  onFechar: () => void;
}

type Etapa = "carregando" | "inativo" | "qr" | "ativo" | "sucesso-ativou" | "sucesso-desativou";

export default function Verificacao2faModal({ onFechar }: Verificacao2faModalProps) {
  const [etapa, setEtapa] = useState<Etapa>("carregando");
  const [qrSvg, setQrSvg] = useState("");
  const [secret, setSecret] = useState("");
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let ativo = true;
    api.me()
      .then((u) => { if (ativo) setEtapa((u as { totpAtivo?: boolean }).totpAtivo ? "ativo" : "inativo"); })
      .catch(() => { if (ativo) { setErro("Não foi possível carregar o status do 2FA."); setEtapa("inativo"); } });
    return () => { ativo = false; };
  }, []);

  async function gerarQr() {
    setErro(""); setOcupado(true);
    try {
      const r = await api.totpSetup();
      setQrSvg(r.qrSvg);
      setSecret(r.secret);
      setEtapa("qr");
    } catch (e) {
      setErro((e as Error).message || "Falha ao gerar o QR code");
    } finally {
      setOcupado(false);
    }
  }

  async function ativar() {
    setErro("");
    if (!/^\d{6}$/.test(codigo.trim())) { setErro("Digite o código de 6 dígitos do app."); return; }
    setOcupado(true);
    try {
      await api.totpAtivar(codigo.trim());
      setEtapa("sucesso-ativou");
    } catch (e) {
      setErro((e as Error).message || "Código inválido");
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    setErro("");
    if (!senha) { setErro("Informe sua senha para desativar."); return; }
    setOcupado(true);
    try {
      await api.totpDesativar(senha);
      setEtapa("sucesso-desativou");
    } catch (e) {
      setErro((e as Error).message || "Senha incorreta");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div
      onClick={() => !ocupado && onFechar()}
      className="fixed inset-0 bg-black/65 flex items-center justify-center p-5 z-[100]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-gp-card border border-gp-border rounded-[14px] w-full max-w-[440px] p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-start mb-[18px]">
          <div>
            <div className="text-gp-white font-bold text-lg">🛡️ Verificação em duas etapas</div>
            <div className="text-gp-muted text-xs mt-[2px]">
              Código do app autenticador exigido a cada login
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={ocupado}
            className="bg-transparent border-none text-gp-muted text-[22px] cursor-pointer"
          >
            ×
          </button>
        </div>

        {etapa === "carregando" && (
          <div className="text-gp-muted text-sm py-4 text-center">Carregando…</div>
        )}

        {etapa === "inativo" && (
          <>
            <p className="text-gp-text text-sm leading-relaxed mt-0">
              Com o 2FA ativo, entrar na sua conta exige a senha <b>e</b> um código de
              6 dígitos gerado no seu celular (Google Authenticator, Authy, Microsoft
              Authenticator…). Mesmo que alguém descubra sua senha, não entra.
            </p>
            <BotaoPrimario onClick={gerarQr} disabled={ocupado}>
              {ocupado ? "Gerando…" : "Ativar — gerar QR code"}
            </BotaoPrimario>
          </>
        )}

        {etapa === "qr" && (
          <>
            <p className="text-gp-text text-sm leading-relaxed mt-0">
              <b>1.</b> Abra o app autenticador e escaneie o QR code:
            </p>
            <div
              className="bg-white rounded-lg p-3 mx-auto w-fit"
              // SVG gerado pelo NOSSO backend (lib qrcode) — conteudo confiavel.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="text-gp-muted text-xs mt-2 text-center">
              Sem câmera? Digite a chave manualmente:{" "}
              <code className="text-gp-text select-all">{secret}</code>
            </p>
            <p className="text-gp-text text-sm leading-relaxed">
              <b>2.</b> Digite o código de 6 dígitos que apareceu no app:
            </p>
            <input
              type="text" inputMode="numeric" maxLength={6} autoFocus
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") ativar(); }}
              placeholder="000000"
              className="w-full bg-gp-surface border border-gp-border rounded-lg px-3 py-[10px] text-gp-text text-center text-xl tracking-[0.4em] outline-none box-border"
            />
            <BotaoPrimario onClick={ativar} disabled={ocupado}>
              {ocupado ? "Verificando…" : "Confirmar e ativar"}
            </BotaoPrimario>
          </>
        )}

        {etapa === "ativo" && (
          <>
            <div
              className="px-[14px] py-3 rounded-lg text-sm font-semibold text-gp-green mb-3"
              style={{ background: C.green + "22", border: `1px solid ${C.green}55` }}
            >
              ✓ 2FA está ativo nesta conta
            </div>
            <p className="text-gp-muted text-[13px] leading-relaxed">
              Para desativar, confirme sua senha. Trocou de celular? Desative aqui e
              ative de novo no aparelho novo.
            </p>
            <Campo label="Sua senha">
              <input
                type="password" value={senha}
                onChange={(e) => setSenha(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") desativar(); }}
                className="w-full bg-gp-surface border border-gp-border rounded-lg px-3 py-[10px] text-gp-text text-sm outline-none box-border"
              />
            </Campo>
            <BotaoPerigo onClick={desativar} disabled={ocupado}>
              {ocupado ? "Desativando…" : "Desativar 2FA"}
            </BotaoPerigo>
          </>
        )}

        {(etapa === "sucesso-ativou" || etapa === "sucesso-desativou") && (
          <div
            className="px-[14px] py-4 rounded-lg text-sm font-semibold text-center text-gp-green"
            style={{ background: C.green + "22", border: `1px solid ${C.green}55` }}
          >
            {etapa === "sucesso-ativou"
              ? "✓ 2FA ativado! No próximo login será pedido o código do app."
              : "✓ 2FA desativado."}
          </div>
        )}

        {erro && etapa !== "carregando" && (
          <div
            className="mt-3 px-3 py-[10px] rounded-lg text-gp-red text-[13px]"
            style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}
          >
            {erro}
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-gp-muted text-xs mb-[6px] font-semibold">{label}</label>
      {children}
    </div>
  );
}

function BotaoPrimario({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className="w-full mt-4 text-gp-accent-ink border-none rounded-lg px-[22px] py-[11px] font-bold text-[13px] cursor-pointer"
      style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`, opacity: disabled ? 0.7 : 1 }}
    >
      {children}
    </button>
  );
}

function BotaoPerigo({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className="w-full mt-2 rounded-lg px-[22px] py-[11px] font-bold text-[13px] cursor-pointer text-gp-red"
      style={{ background: C.red + "18", border: `1px solid ${C.red}55`, opacity: disabled ? 0.7 : 1 }}
    >
      {children}
    </button>
  );
}
