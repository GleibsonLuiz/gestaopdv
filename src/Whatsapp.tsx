import { useEffect, useState, useCallback } from "react";
import { api } from "./lib/api";
import { C } from "./lib/theme";

// =====================================================================
// ETAPA#9b — Atendimento Inteligente (WhatsApp + IA Claude)
//
// 2 abas:
//   - Conexao: instanceName + token do gateway externo (Evolution API)
//     + botao "Conectar/Gerar QR Code" + card de status.
//   - Configuracao da IA: switch ativo + textarea com prompt do agente.
//
// Logs do atendimento (mensagens recebidas + respostas) ficam abaixo
// das abas, ultimas 50.
// =====================================================================

interface ConfigWhatsapp {
  configurada: boolean;
  instanceName: string | null;
  instanceTokenMascarado: string | null;
  webhookSecret: string | null;
  aiSystemPrompt: string | null;
  isActive: boolean;
  statusConexao: string | null;
}

interface LogItem {
  id: string;
  numero: string;
  nomeContato?: string | null;
  mensagem: string;
  resposta?: string | null;
  sucesso: boolean;
  erro?: string | null;
  duracaoMs?: number | null;
  createdAt: string;
}

type Aba = "conexao" | "ia";

const PROMPT_EXEMPLO = `Voce e o assistente virtual da Via-feira Papelaria. Seja amigavel e direto, responda em ate 3 frases. Quando o cliente perguntar sobre um produto, descreva-o brevemente e indique se temos em estoque. Nao prometa precos sem antes consultar o atendimento humano. Para pedidos, oriente o cliente a passar na loja ou ligar para (11) 99999-0000.`;

export default function Whatsapp() {
  const [aba, setAba] = useState<Aba>("conexao");
  const [cfg, setCfg] = useState<ConfigWhatsapp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [logs, setLogs] = useState<LogItem[]>([]);

  // form conexao
  const [instanceName, setInstanceName] = useState("");
  const [instanceToken, setInstanceToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  // form IA
  const [aiSystemPrompt, setAiSystemPrompt] = useState("");
  const [isActive, setIsActive] = useState(false);

  const [salvando, setSalvando] = useState(false);
  const [salvouFlash, setSalvouFlash] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [carregandoQr, setCarregandoQr] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const c = await api.obterConfigWhatsapp() as ConfigWhatsapp;
      setCfg(c);
      setInstanceName(c.instanceName || "");
      setInstanceToken(""); // nunca pre-preenche token cifrado
      setWebhookSecret(c.webhookSecret || "");
      setAiSystemPrompt(c.aiSystemPrompt || "");
      setIsActive(c.isActive);
      const ls = await api.listarLogsWhatsapp({ limite: "50" });
      setLogs(Array.isArray(ls) ? ls as LogItem[] : []);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    setSalvando(true);
    setErro("");
    try {
      await api.salvarConfigWhatsapp({
        instanceName: instanceName.trim(),
        instanceToken: instanceToken.trim() || undefined,
        webhookSecret: webhookSecret.trim() || null,
        aiSystemPrompt: aiSystemPrompt.trim() || null,
        isActive,
      });
      setSalvouFlash(true);
      setTimeout(() => setSalvouFlash(false), 1800);
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function gerarQrCode() {
    setCarregandoQr(true);
    setQrCode(null);
    setErro("");
    try {
      const r = await api.obterQrCodeWhatsapp() as { base64?: string; qrcode?: { base64?: string }; code?: string };
      // Evolution costuma retornar em r.base64 OR r.qrcode.base64
      const b64 = r.base64 || r.qrcode?.base64 || r.code || null;
      setQrCode(b64);
    } catch (err) {
      setErro("Falha ao gerar QR Code: " + (err as Error).message);
    } finally {
      setCarregandoQr(false);
    }
  }

  async function atualizarStatus() {
    try {
      await api.obterStatusWhatsapp();
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function remover() {
    if (!confirm("Remover credenciais do WhatsApp? Isso desativa o atendimento automatico.")) return;
    try {
      await api.removerConfigWhatsapp();
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const statusColor = cfg?.statusConexao === "open" || cfg?.statusConexao === "CONNECTED"
    ? C.green
    : cfg?.statusConexao === "qrcode" ? C.yellow
    : C.muted;

  return (
    <div style={{ padding: "0 6px" }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: 14, marginBottom: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ color: C.white, fontSize: 16, fontWeight: 700 }}>💬 Atendimento Inteligente WhatsApp</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
              Conecte sua instância do WhatsApp (Evolution API) e configure o agente de IA Claude para responder seus clientes automaticamente.
            </div>
          </div>
          <div style={{
            padding: "6px 14px", borderRadius: 999,
            background: statusColor + "22", border: `1px solid ${statusColor}55`,
            color: statusColor, fontSize: 11, fontWeight: 700,
          }}>
            {cfg?.isActive ? "🤖 ATIVO" : "⏸ INATIVO"} · {cfg?.statusConexao || "OFFLINE"}
          </div>
        </div>
      </div>

      {erro && (
        <div style={{
          padding: "10px 14px", marginBottom: 12, borderRadius: 8,
          background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
        }}>{erro}</div>
      )}

      {/* TABS */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(["conexao", "ia"] as Aba[]).map(t => (
          <button key={t} type="button" onClick={() => setAba(t)} style={{
            padding: "10px 18px", borderRadius: "8px 8px 0 0",
            background: aba === t ? C.card : "transparent",
            border: aba === t ? `1px solid ${C.border}` : "1px solid transparent",
            borderBottom: aba === t ? `1px solid ${C.card}` : `1px solid ${C.border}`,
            color: aba === t ? C.white : C.muted,
            fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            {t === "conexao" ? "🔌 Conexão" : "🧠 Configuração da IA"}
          </button>
        ))}
      </div>

      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: "0 10px 10px 10px",
        padding: 18, marginBottom: 14,
      }}>
        {carregando ? (
          <div style={{ color: C.muted, padding: 16, textAlign: "center" }}>Carregando...</div>
        ) : aba === "conexao" ? (
          <AbaConexao
            cfg={cfg}
            instanceName={instanceName} setInstanceName={setInstanceName}
            instanceToken={instanceToken} setInstanceToken={setInstanceToken}
            webhookSecret={webhookSecret} setWebhookSecret={setWebhookSecret}
            qrCode={qrCode} carregandoQr={carregandoQr}
            onGerarQr={gerarQrCode}
            onAtualizarStatus={atualizarStatus}
            onRemover={remover}
          />
        ) : (
          <AbaIA
            cfg={cfg}
            aiSystemPrompt={aiSystemPrompt} setAiSystemPrompt={setAiSystemPrompt}
            isActive={isActive} setIsActive={setIsActive}
            onUsarExemplo={() => setAiSystemPrompt(PROMPT_EXEMPLO)}
          />
        )}
      </div>

      {/* AÇÕES */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, alignItems: "center" }}>
        <button type="button" onClick={salvar} disabled={salvando} style={{
          padding: "10px 22px", borderRadius: 8,
          background: `linear-gradient(135deg, ${C.green}, ${C.accent})`,
          border: "none", color: "white", fontWeight: 800, fontSize: 13,
          cursor: salvando ? "wait" : "pointer",
        }}>
          {salvando ? "Salvando..." : "💾 Salvar Configurações"}
        </button>
        {salvouFlash && (
          <span style={{ color: C.green, fontSize: 12 }}>✓ Salvo</span>
        )}
      </div>

      {/* LOGS */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: 14,
      }}>
        <div style={{ color: C.white, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          📜 Histórico de atendimentos ({logs.length})
        </div>
        {logs.length === 0 ? (
          <div style={{ color: C.muted, padding: 16, textAlign: "center", fontSize: 12 }}>
            Nenhuma mensagem registrada ainda. Configure o webhook no painel do seu gateway WhatsApp para começar a receber.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 480, overflowY: "auto" }}>
            {logs.map(l => (
              <div key={l.id} style={{
                padding: 10, borderRadius: 6,
                background: C.surface,
                borderLeft: `3px solid ${l.sucesso ? C.green : C.red}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginBottom: 4 }}>
                  <span>{l.nomeContato || l.numero}</span>
                  <span>{new Date(l.createdAt).toLocaleString("pt-BR")}{l.duracaoMs ? ` · ${l.duracaoMs}ms` : ""}</span>
                </div>
                <div style={{ color: C.text, fontSize: 13, marginBottom: 4 }}>
                  <b style={{ color: C.muted }}>Cliente:</b> {l.mensagem}
                </div>
                {l.resposta && (
                  <div style={{ color: C.white, fontSize: 13 }}>
                    <b style={{ color: C.green }}>IA:</b> {l.resposta}
                  </div>
                )}
                {l.erro && (
                  <div style={{ color: C.red, fontSize: 11, marginTop: 4 }}>
                    ⚠ {l.erro}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
interface ConexaoProps {
  cfg: ConfigWhatsapp | null;
  instanceName: string; setInstanceName: (v: string) => void;
  instanceToken: string; setInstanceToken: (v: string) => void;
  webhookSecret: string; setWebhookSecret: (v: string) => void;
  qrCode: string | null; carregandoQr: boolean;
  onGerarQr: () => void;
  onAtualizarStatus: () => void;
  onRemover: () => void;
}
function AbaConexao(p: ConexaoProps) {
  return (
    <div>
      <label style={labelStyle}>Nome da Instância *</label>
      <input value={p.instanceName} onChange={e => p.setInstanceName(e.target.value)}
        placeholder="ex: papelaria-via-feira" style={inputStyle} maxLength={80} />

      <label style={{ ...labelStyle, marginTop: 12 }}>
        Token da API (Evolution / gateway) *
        {p.cfg?.configurada && (
          <span style={{ color: C.muted, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>
            {" "}— atual: <code>{p.cfg.instanceTokenMascarado}</code>
          </span>
        )}
      </label>
      <input type="password" value={p.instanceToken} onChange={e => p.setInstanceToken(e.target.value)}
        placeholder={p.cfg?.configurada ? "Deixe vazio para preservar" : "Cole o token aqui"}
        style={inputStyle} />

      <label style={{ ...labelStyle, marginTop: 12 }}>Webhook Secret (opcional)</label>
      <input value={p.webhookSecret} onChange={e => p.setWebhookSecret(e.target.value)}
        placeholder="Segredo opcional para validar o webhook" style={inputStyle} />

      <div style={{
        marginTop: 16, padding: 12, borderRadius: 8,
        background: C.surface, border: `1px solid ${C.border}`,
      }}>
        <div style={{ color: C.white, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
          📱 Conectar dispositivo (escanear QR Code)
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={p.onGerarQr} disabled={!p.cfg?.configurada || p.carregandoQr}
            style={btnSec(C.accent, p.carregandoQr)}>
            {p.carregandoQr ? "Gerando..." : "🔄 Gerar QR Code"}
          </button>
          <button type="button" onClick={p.onAtualizarStatus} disabled={!p.cfg?.configurada}
            style={btnSec(C.green, false)}>
            🔍 Atualizar status
          </button>
          {p.cfg?.configurada && (
            <button type="button" onClick={p.onRemover}
              style={btnSec(C.red, false, true)}>
              🗑 Remover credenciais
            </button>
          )}
        </div>
        {p.qrCode && (
          <div style={{ marginTop: 14, textAlign: "center" }}>
            <img src={p.qrCode.startsWith("data:") ? p.qrCode : `data:image/png;base64,${p.qrCode}`}
              alt="QR Code WhatsApp"
              style={{ maxWidth: 240, background: "white", padding: 8, borderRadius: 6 }} />
            <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>
              Abra WhatsApp &gt; Aparelhos conectados &gt; Conectar um aparelho.
            </div>
          </div>
        )}
      </div>

      <div style={{
        marginTop: 14, padding: 10, borderRadius: 6,
        background: C.accent + "11", border: `1px solid ${C.accent}44`,
        color: C.text, fontSize: 11.5, lineHeight: 1.5,
      }}>
        💡 <b>Como funciona:</b> O webhook publico do GestãoProMax está em
        {" "}<code style={{ background: C.surface, padding: "1px 6px", borderRadius: 3 }}>
          POST /webhooks/whatsapp
        </code>. Configure essa URL no painel do seu Evolution API com o
        evento <code>messages.upsert</code>. Mensagens de grupos são ignoradas
        automaticamente.
      </div>
    </div>
  );
}

// =====================================================================
interface IAProps {
  cfg: ConfigWhatsapp | null;
  aiSystemPrompt: string; setAiSystemPrompt: (v: string) => void;
  isActive: boolean; setIsActive: (v: boolean) => void;
  onUsarExemplo: () => void;
}
function AbaIA(p: IAProps) {
  return (
    <div>
      <div style={{
        padding: 12, borderRadius: 8, marginBottom: 16,
        background: p.isActive ? C.green + "11" : C.muted + "11",
        border: `1px solid ${p.isActive ? C.green : C.muted}44`,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div>
          <div style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>
            {p.isActive ? "🤖 Atendimento autônomo ATIVO" : "⏸ Atendimento autônomo INATIVO"}
          </div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
            {p.isActive
              ? "A IA responde automaticamente todas as mensagens recebidas."
              : "Mensagens recebidas serão registradas mas não respondidas."}
          </div>
        </div>
        {/* Toggle switch simples */}
        <button type="button" onClick={() => p.setIsActive(!p.isActive)}
          style={{
            width: 52, height: 28, borderRadius: 999,
            background: p.isActive ? C.green : C.muted + "55",
            border: "none", cursor: "pointer", position: "relative",
            padding: 0, transition: "background .15s",
          }}>
          <span style={{
            position: "absolute", top: 3, left: p.isActive ? 27 : 3,
            width: 22, height: 22, borderRadius: "50%",
            background: "white", transition: "left .15s",
          }} />
        </button>
      </div>

      <label style={labelStyle}>
        Instruções do Agente
        <button type="button" onClick={p.onUsarExemplo}
          style={{ marginLeft: 10, background: "transparent", border: `1px solid ${C.accent}55`, color: C.accent, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
          ✨ Usar exemplo
        </button>
      </label>
      <textarea value={p.aiSystemPrompt} onChange={e => p.setAiSystemPrompt(e.target.value)}
        placeholder={PROMPT_EXEMPLO}
        rows={10}
        style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12, lineHeight: 1.5, resize: "vertical", minHeight: 200 }} />
      <div style={{ color: C.muted, fontSize: 10.5, marginTop: 6 }}>
        Essa instrução é injetada como <code>system prompt</code> em toda chamada para Claude.
        Defina personalidade, escopo, restrições (ex: nunca prometer preços) e tom de voz.
      </div>

      <div style={{
        marginTop: 14, padding: 10, borderRadius: 6,
        background: C.yellow + "11", border: `1px solid ${C.yellow}44`,
        color: C.text, fontSize: 11.5,
      }}>
        ⚠ <b>Importante:</b> antes de ativar, configure no servidor a variável
        de ambiente <code style={{ background: C.surface, padding: "1px 6px", borderRadius: 3 }}>ANTHROPIC_API_KEY</code>.
        Obtenha em <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style={{ color: C.accent }}>console.anthropic.com</a>.
      </div>
    </div>
  );
}

// =====================================================================
const labelStyle: React.CSSProperties = {
  display: "block", color: C.muted, fontSize: 11, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  background: C.surface, border: `1px solid ${C.border}`,
  color: C.text, fontSize: 13, outline: "none",
  fontFamily: "inherit", boxSizing: "border-box",
};
function btnSec(cor: string, ocupado: boolean, ghost = false): React.CSSProperties {
  return {
    padding: "8px 14px", borderRadius: 7,
    background: ghost ? "transparent" : cor + "22",
    border: `1px solid ${cor}55`,
    color: cor, fontSize: 12, fontWeight: 700,
    cursor: ocupado ? "wait" : "pointer", opacity: ocupado ? 0.6 : 1,
  };
}
