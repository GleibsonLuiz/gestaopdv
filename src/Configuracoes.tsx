import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { C } from "./lib/theme";
import { api, BASE_URL, type SessionUser } from "./lib/api";

export type TipoCaixa = "INDEPENDENTE" | "COMPARTILHADO";

// Tipo canonico da configuracao da empresa. Outros modulos (HeaderRelatorio,
// cupons, etc) importam daqui para tipar respostas de api.obterConfiguracao().
export interface ConfiguracaoEmpresa {
  razaoSocial?: string;
  nomeFantasia?: string;
  cnpj?: string;
  inscEstadual?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  observacoes?: string;
  tipoCaixa?: TipoCaixa;
  logotipo?: string | null;
  [extra: string]: unknown;
}

interface FormState {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscEstadual: string;
  telefone: string;
  email: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  observacoes: string;
  tipoCaixa: TipoCaixa;
}

const VAZIO: FormState = {
  razaoSocial: "",
  nomeFantasia: "",
  cnpj: "",
  inscEstadual: "",
  telefone: "",
  email: "",
  endereco: "",
  numero: "",
  bairro: "",
  cidade: "",
  estado: "",
  cep: "",
  observacoes: "",
  tipoCaixa: "INDEPENDENTE",
};

export function urlLogotipo(logotipo: string | null | undefined): string | null {
  if (!logotipo) return null;
  if (/^https?:\/\//i.test(logotipo)) return logotipo;
  return `${BASE_URL}${logotipo}`;
}

interface ConfiguracoesProps {
  user: SessionUser;
}

export default function Configuracoes({ user }: ConfiguracoesProps) {
  const [form, setForm] = useState<FormState>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [logotipoAtual, setLogotipoAtual] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const inputLogoRef = useRef<HTMLInputElement | null>(null);

  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE";

  useEffect(() => {
    let ativo = true;
    api.obterConfiguracao()
      .then((raw) => {
        if (!ativo) return;
        const cfg = raw as ConfiguracaoEmpresa | null;
        if (!cfg) return;
        setForm({
          razaoSocial: cfg.razaoSocial || "",
          nomeFantasia: cfg.nomeFantasia || "",
          cnpj: cfg.cnpj || "",
          inscEstadual: cfg.inscEstadual || "",
          telefone: cfg.telefone || "",
          email: cfg.email || "",
          endereco: cfg.endereco || "",
          numero: cfg.numero || "",
          bairro: cfg.bairro || "",
          cidade: cfg.cidade || "",
          estado: cfg.estado || "",
          cep: cfg.cep || "",
          observacoes: cfg.observacoes || "",
          tipoCaixa: cfg.tipoCaixa || "INDEPENDENTE",
        });
        setLogotipoAtual(cfg.logotipo || null);
        setLogoPreview(cfg.logotipo ? urlLogotipo(cfg.logotipo) : null);
      })
      .catch((err: Error) => setErro(err.message))
      .finally(() => setCarregando(false));
    return () => { ativo = false; };
  }, []);

  function flash(t: string) {
    setMensagem(t);
    setTimeout(() => setMensagem(""), 2500);
  }

  function escolherLogo(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpe?g|png|webp|svg\+xml)$/i.test(file.type)) {
      setErro("Apenas JPG, PNG, WEBP ou SVG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErro("Logotipo maior que 2MB.");
      return;
    }
    setErro("");
    setLogoFile(file);
    setLogoPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  async function removerLogoAtual() {
    if (!logotipoAtual) {
      // Apenas limpa o preview local sem chamar backend.
      if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
      setLogoFile(null);
      setLogoPreview(null);
      return;
    }
    if (!confirm("Remover logotipo atual?")) return;
    try {
      await api.excluirLogotipo();
      setLogotipoAtual(null);
      setLogoFile(null);
      if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
      setLogoPreview(null);
      if (inputLogoRef.current) inputLogoRef.current.value = "";
      flash("Logotipo removido");
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");
    if (!form.razaoSocial.trim()) { setErro("Razão social é obrigatória"); return; }
    setSalvando(true);
    try {
      await api.salvarConfiguracao(form);
      // Logo: upload separado se houver arquivo selecionado.
      if (logoFile) {
        try {
          const cfg = await api.enviarLogotipo(logoFile) as ConfiguracaoEmpresa;
          setLogotipoAtual(cfg.logotipo || null);
          setLogoFile(null);
          if (inputLogoRef.current) inputLogoRef.current.value = "";
        } catch (errLogo) {
          flash(`Dados salvos, mas o logotipo falhou: ${(errLogo as Error).message}`);
          setSalvando(false);
          return;
        }
      }
      flash("Configurações salvas");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <div className="p-[30px] text-center text-gp-muted">Carregando…</div>;
  }

  return (
    <div>
      {mensagem && <div style={alertStyle(C.green)}>{mensagem}</div>}
      {erro && <div style={alertStyle(C.red)}>{erro}</div>}

      {!podeEditar && (
        <div style={alertStyle(C.yellow)}>
          🔒 Apenas ADMIN ou GERENTE pode editar os dados da empresa. Você está vendo em modo leitura.
        </div>
      )}

      <form onSubmit={salvar}>
        <div className="grid gap-5" style={{ gridTemplateColumns: "200px 1fr" }}>
          {/* COLUNA ESQUERDA: LOGO */}
          <div className="bg-gp-card border border-gp-border rounded-xl p-4 flex flex-col gap-[10px] items-center">
            <div className="text-gp-muted text-[11px] font-bold tracking-[0.4px]">
              LOGOTIPO
            </div>
            <div
              onClick={() => podeEditar && inputLogoRef.current?.click()}
              className="w-[168px] h-[168px] rounded-xl bg-gp-surface flex items-center justify-center overflow-hidden"
              style={{
                border: `2px dashed ${C.border}`,
                cursor: podeEditar ? "pointer" : "default",
              }}
            >
              {logoPreview ? (
                <img src={logoPreview} alt="logo" className="w-full h-full object-contain" />
              ) : (
                <div className="text-gp-muted text-xs text-center p-[10px]">
                  <div className="text-[32px]">🖼️</div>
                  {podeEditar ? "Clique para enviar" : "Sem logotipo"}
                </div>
              )}
            </div>
            {podeEditar && (
              <>
                <input
                  ref={inputLogoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  onChange={(e) => escolherLogo(e.target.files?.[0])}
                  className="hidden"
                />
                <button type="button" onClick={() => inputLogoRef.current?.click()} style={btnSecundario}>
                  {logoPreview ? "Trocar" : "Escolher arquivo"}
                </button>
                {logoPreview && (
                  <button type="button" onClick={removerLogoAtual} style={btnPerigo}>
                    Remover
                  </button>
                )}
                <div className="text-gp-muted text-[10px] text-center leading-[1.4]">
                  PNG / JPG / WEBP / SVG<br />max 2 MB
                </div>
              </>
            )}
          </div>

          {/* COLUNA DIREITA: FORMULARIO */}
          <div className="bg-gp-card border border-gp-border rounded-xl p-5">
            <Secao titulo="Identificação">
              <div className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr" }}>
                <Campo label="Razão social *">
                  <input
                    value={form.razaoSocial}
                    onChange={(e) => setForm((f) => ({ ...f, razaoSocial: e.target.value.toUpperCase() }))}
                    disabled={!podeEditar}
                    required
                    style={inputStyle(podeEditar)}
                  />
                </Campo>
                <Campo label="CNPJ">
                  <input
                    value={form.cnpj}
                    onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))}
                    disabled={!podeEditar}
                    placeholder="00.000.000/0000-00"
                    style={inputStyle(podeEditar)}
                  />
                </Campo>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr" }}>
                <Campo label="Nome fantasia">
                  <input
                    value={form.nomeFantasia}
                    onChange={(e) => setForm((f) => ({ ...f, nomeFantasia: e.target.value.toUpperCase() }))}
                    disabled={!podeEditar}
                    style={inputStyle(podeEditar)}
                  />
                </Campo>
                <Campo label="Inscrição estadual">
                  <input
                    value={form.inscEstadual}
                    onChange={(e) => setForm((f) => ({ ...f, inscEstadual: e.target.value }))}
                    disabled={!podeEditar}
                    placeholder="Opcional"
                    style={inputStyle(podeEditar)}
                  />
                </Campo>
              </div>
            </Secao>

            <Secao titulo="Contato">
              <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 2fr" }}>
                <Campo label="Telefone">
                  <input
                    value={form.telefone}
                    onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                    disabled={!podeEditar}
                    placeholder="(00) 00000-0000"
                    style={inputStyle(podeEditar)}
                  />
                </Campo>
                <Campo label="E-mail">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    disabled={!podeEditar}
                    style={inputStyle(podeEditar)}
                  />
                </Campo>
              </div>
            </Secao>

            <Secao titulo="Endereço">
              <div className="grid gap-3" style={{ gridTemplateColumns: "3fr 1fr 2fr" }}>
                <Campo label="Logradouro">
                  <input
                    value={form.endereco}
                    onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value.toUpperCase() }))}
                    disabled={!podeEditar}
                    style={inputStyle(podeEditar)}
                  />
                </Campo>
                <Campo label="Número">
                  <input
                    value={form.numero}
                    onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))}
                    disabled={!podeEditar}
                    style={inputStyle(podeEditar)}
                  />
                </Campo>
                <Campo label="Bairro">
                  <input
                    value={form.bairro}
                    onChange={(e) => setForm((f) => ({ ...f, bairro: e.target.value.toUpperCase() }))}
                    disabled={!podeEditar}
                    style={inputStyle(podeEditar)}
                  />
                </Campo>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
                <Campo label="Cidade">
                  <input
                    value={form.cidade}
                    onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value.toUpperCase() }))}
                    disabled={!podeEditar}
                    style={inputStyle(podeEditar)}
                  />
                </Campo>
                <Campo label="UF">
                  <input
                    value={form.estado}
                    onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value.toUpperCase().slice(0, 2) }))}
                    disabled={!podeEditar}
                    maxLength={2}
                    style={inputStyle(podeEditar)}
                  />
                </Campo>
                <Campo label="CEP">
                  <input
                    value={form.cep}
                    onChange={(e) => setForm((f) => ({ ...f, cep: e.target.value }))}
                    disabled={!podeEditar}
                    placeholder="00.000-000"
                    style={inputStyle(podeEditar)}
                  />
                </Campo>
              </div>
            </Secao>

            <Secao titulo="Observações">
              <Campo>
                <textarea
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  disabled={!podeEditar}
                  rows={2}
                  placeholder="Texto adicional para aparecer no rodapé de impressões (opcional)"
                  style={{ ...inputStyle(podeEditar), resize: "vertical", fontFamily: "inherit" }}
                />
              </Campo>
            </Secao>

            <Secao titulo="Operação do caixa">
              <div className="text-gp-muted text-[11px] mb-2">
                Define como a abertura/fechamento de caixa funciona para todos os
                operadores do sistema. Não é possível alterar enquanto houver
                caixa aberto.
              </div>
              <div className="grid gap-[10px]" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <OpcaoCaixa
                  marcada={form.tipoCaixa === "INDEPENDENTE"}
                  disabled={!podeEditar}
                  titulo="Caixa Independente"
                  icone="👤"
                  descricao="Cada operador abre e gerencia o próprio caixa. Vendas exigem caixa pessoal aberto."
                  onSelecionar={() => setForm((f) => ({ ...f, tipoCaixa: "INDEPENDENTE" }))}
                />
                <OpcaoCaixa
                  marcada={form.tipoCaixa === "COMPARTILHADO"}
                  disabled={!podeEditar}
                  titulo="Caixa Compartilhado"
                  icone="👥"
                  descricao="Um único caixa por turno para toda a empresa. Todos vendem no mesmo caixa aberto."
                  onSelecionar={() => setForm((f) => ({ ...f, tipoCaixa: "COMPARTILHADO" }))}
                />
              </div>
            </Secao>

            {podeEditar && (
              <div className="flex justify-end mt-[14px]">
                <button
                  type="submit"
                  disabled={salvando}
                  className="text-gp-white border-none rounded-lg px-6 py-3 font-bold text-sm"
                  style={{
                    background: salvando ? C.muted : `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                    cursor: salvando ? "default" : "pointer",
                    boxShadow: salvando ? "none" : `0 2px 10px ${C.accent}55`,
                  }}
                >
                  {salvando ? "Salvando…" : "💾 Salvar configurações"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* CARD INFORMATIVO: PROPRIETARIO */}
        <div
          className="mt-5 p-4 rounded-[10px] flex items-center gap-3"
          style={{ background: C.purple + "22", border: `1px solid ${C.purple}55` }}
        >
          <div className="text-[28px]">👑</div>
          <div>
            <div className="text-gp-purple font-extrabold text-[13px]">
              PROPRIETÁRIO E ADMINISTRADOR MESTRE
            </div>
            <div className="text-gp-text text-[13px] mt-[2px]">
              <b>{form.razaoSocial || "—"}</b>
              {form.cnpj && <span className="text-gp-muted"> · CNPJ {form.cnpj}</span>}
            </div>
          </div>
        </div>
      </form>

      {/* MAQUININHA MERCADO PAGO POINT — card separado com submit proprio
          (PUT /pagamentos-mp/config). Encapsulado em <BlocoMaquininhaMP> para
          nao inflar este componente. */}
      <BlocoMaquininhaMP podeEditar={podeEditar} />
    </div>
  );
}

// ============ MAQUININHA MERCADO PAGO POINT ============
//
// Guarda credenciais MP (ACCESS_TOKEN + device_id) por tenant. O token vai
// cifrado pelo backend (AES-256-GCM) e o GET sempre devolve mascarado.
// Quando ativado, o PDV passa a exibir o botao "Cobrar na maquininha".

interface ConfigMpResposta {
  configurada: boolean;
  mpAtivo: boolean;
  mpPixAtivo: boolean;
  mpDeviceId: string | null;
  mpUserIdMp: string | null;
  mpAccessTokenMascarado: string | null;
}

interface BlocoMaquininhaMPProps {
  podeEditar: boolean;
}

function BlocoMaquininhaMP({ podeEditar }: BlocoMaquininhaMPProps) {
  const [carregando, setCarregando] = useState(true);
  const [cfg, setCfg] = useState<ConfigMpResposta | null>(null);
  // tokenInput vazio significa "manter o atual" — so envia se o usuario digitar
  // algo novo. Para LIMPAR a credencial usa o botao "Remover credencial".
  const [tokenInput, setTokenInput] = useState("");
  const [deviceInput, setDeviceInput] = useState("");
  const [userInput, setUserInput] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [pixAtivo, setPixAtivo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  function carregar() {
    setCarregando(true);
    api.obterConfigMp()
      .then((raw) => {
        const c = raw as ConfigMpResposta;
        setCfg(c);
        setDeviceInput(c?.mpDeviceId || "");
        setUserInput(c?.mpUserIdMp || "");
        setAtivo(!!c?.mpAtivo);
        setPixAtivo(!!c?.mpPixAtivo);
      })
      .catch((err: Error) => setErro(err.message))
      .finally(() => setCarregando(false));
  }

  useEffect(() => { carregar(); }, []);

  function flash(t: string) {
    setMsg(t);
    setTimeout(() => setMsg(""), 2500);
  }

  async function salvar() {
    setErro("");
    setSalvando(true);
    try {
      const body: Record<string, unknown> = {
        mpDeviceId: deviceInput.trim() || null,
        mpUserIdMp: userInput.trim() || null,
        mpAtivo: ativo,
        mpPixAtivo: pixAtivo,
      };
      if (tokenInput.trim()) {
        body.mpAccessToken = tokenInput.trim();
      }
      const resp = await api.salvarConfigMp(body) as ConfigMpResposta;
      setCfg(resp);
      setTokenInput("");
      setAtivo(resp.mpAtivo);
      setPixAtivo(resp.mpPixAtivo);
      flash("Configuração da maquininha salva");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function removerCredencial() {
    if (!confirm("Remover credenciais da maquininha? O PDV deixará de oferecer cobrança via Mercado Pago.")) return;
    setSalvando(true);
    try {
      const resp = await api.salvarConfigMp({
        mpAccessToken: "",
        mpDeviceId: null,
        mpUserIdMp: null,
        mpAtivo: false,
        mpPixAtivo: false,
      }) as ConfigMpResposta;
      setCfg(resp);
      setTokenInput("");
      setDeviceInput("");
      setUserInput("");
      setAtivo(false);
      setPixAtivo(false);
      flash("Credenciais removidas");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div className="mt-5 p-5 rounded-xl border" style={{ background: C.card, borderColor: C.border }}>
        <div className="text-gp-muted text-[12px]">Carregando configuração da maquininha…</div>
      </div>
    );
  }

  return (
    <div
      className="mt-5 p-5 rounded-xl border"
      style={{ background: C.card, borderColor: C.border }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-gp-white font-extrabold text-[15px] flex items-center gap-2">
            📲 MAQUININHA MERCADO PAGO POINT
            {cfg?.configurada && cfg?.mpAtivo && (
              <span style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 999,
                background: C.green + "22", color: C.green, border: `1px solid ${C.green}55`,
              }}>ATIVA</span>
            )}
            {cfg?.configurada && !cfg?.mpAtivo && (
              <span style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 999,
                background: C.yellow + "22", color: C.yellow, border: `1px solid ${C.yellow}55`,
              }}>CONFIGURADA · PAUSADA</span>
            )}
            {!cfg?.configurada && (
              <span style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 999,
                background: C.muted + "22", color: C.muted, border: `1px solid ${C.muted}55`,
              }}>NÃO CONFIGURADA</span>
            )}
          </div>
          <div className="text-gp-muted text-[12px] mt-[2px]">
            Integração com maquininha física do Mercado Pago (API Point).
            Quando ativa, o PDV exibe um botão para cobrar na maquininha
            sem precisar digitar a forma de pagamento manualmente.
          </div>
        </div>
      </div>

      {msg && <div style={mpAlert(C.green)}>{msg}</div>}
      {erro && <div style={mpAlert(C.red)}>{erro}</div>}

      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label className="block text-gp-muted text-[11px] mb-1 font-semibold">
            ACCESS_TOKEN (chave de produção)
          </label>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            disabled={!podeEditar}
            placeholder={cfg?.mpAccessTokenMascarado
              ? `Atual: ${cfg.mpAccessTokenMascarado}`
              : "APP_USR-... (não preencha para manter o atual)"}
            autoComplete="off"
            style={mpInput(podeEditar)}
          />
          <div className="text-gp-muted text-[10px] mt-1">
            Obtido em <b>Mercado Pago &gt; Suas integrações &gt; Credenciais</b>.
            O token é guardado cifrado (AES-256-GCM) e nunca volta para o navegador.
          </div>
        </div>

        <div>
          <label className="block text-gp-muted text-[11px] mb-1 font-semibold">
            DEVICE_ID (identificador da maquininha)
          </label>
          <input
            value={deviceInput}
            onChange={(e) => setDeviceInput(e.target.value)}
            disabled={!podeEditar}
            placeholder="Ex.: PAX_A910__SMART... ou GERTEC_MP35P..."
            style={mpInput(podeEditar)}
          />
          <div className="text-gp-muted text-[10px] mt-1">
            Encontrado em <b>Mercado Pago &gt; Maquininhas &gt; Configurar dispositivo</b>.
            Cada empresa tem 1 device nesta versão.
          </div>
        </div>
      </div>

      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label className="block text-gp-muted text-[11px] mb-1 font-semibold">
            USER_ID Mercado Pago (opcional)
          </label>
          <input
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            disabled={!podeEditar}
            placeholder="Ex.: 123456789"
            style={mpInput(podeEditar)}
          />
          <div className="text-gp-muted text-[10px] mt-1">
            Acelera o roteamento de webhooks quando o MP envia o user_id.
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <label className="flex items-center gap-2" style={{
            opacity: podeEditar ? 1 : 0.6,
            cursor: podeEditar ? "pointer" : "not-allowed",
          }}>
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              disabled={!podeEditar}
              style={{ width: 18, height: 18 }}
            />
            <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>
              Maquininha ativa no PDV
            </span>
            <span style={{ color: C.muted, fontSize: 11, marginLeft: 4 }}>
              (crédito/débito via Point — requer DEVICE_ID)
            </span>
          </label>
          <label className="flex items-center gap-2" style={{
            opacity: podeEditar ? 1 : 0.6,
            cursor: podeEditar ? "pointer" : "not-allowed",
          }}>
            <input
              type="checkbox"
              checked={pixAtivo}
              onChange={(e) => setPixAtivo(e.target.checked)}
              disabled={!podeEditar}
              style={{ width: 18, height: 18 }}
            />
            <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>
              PIX ativo no PDV
            </span>
            <span style={{ color: C.muted, fontSize: 11, marginLeft: 4 }}>
              (QR Code na tela — não usa maquininha)
            </span>
          </label>
        </div>
      </div>

      {podeEditar && (
        <div className="flex justify-end gap-2 mt-4">
          {cfg?.configurada && (
            <button
              type="button"
              onClick={removerCredencial}
              disabled={salvando}
              style={mpBtnPerigo}
            >
              Remover credenciais
            </button>
          )}
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            style={{
              ...mpBtnPrimario,
              background: salvando ? C.muted : `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              cursor: salvando ? "default" : "pointer",
            }}
          >
            {salvando ? "Salvando…" : "💾 Salvar maquininha"}
          </button>
        </div>
      )}

      {!cfg?.configurada && (
        <div
          className="mt-4 p-3 rounded-[10px]"
          style={{ background: C.accent + "11", border: `1px solid ${C.accent}33`, fontSize: 12, color: C.text, lineHeight: 1.5 }}
        >
          <b style={{ color: C.accent }}>Como configurar pela primeira vez:</b>
          <ol style={{ marginTop: 6, paddingLeft: 18 }}>
            <li>Entre em <b>Mercado Pago &gt; Suas integrações</b> e crie um aplicativo do tipo "Pagamentos in-person / Point".</li>
            <li>Copie o <b>ACCESS_TOKEN</b> de produção (começa com <code>APP_USR-</code>).</li>
            <li>No app Mercado Pago, vá em <b>Maquininhas</b> e ative o <b>Modo PDV / Integração</b> — anote o DEVICE_ID exibido.</li>
            <li>Cole os dois aqui, marque "Ativa" e salve.</li>
            <li>Configure o webhook em <b>MP &gt; Webhooks</b> apontando para <code>https://SEU-BACKEND/pagamentos-mp/webhook</code> (eventos: <i>payment</i>).</li>
          </ol>
        </div>
      )}
    </div>
  );
}

function mpInput(habilitado: boolean): CSSProperties {
  return {
    width: "100%",
    background: habilitado ? C.surface : C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "9px 12px",
    color: habilitado ? C.text : C.muted,
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    cursor: habilitado ? "text" : "not-allowed",
  };
}

function mpAlert(cor: string): CSSProperties {
  return {
    marginBottom: 12,
    padding: "10px 14px",
    borderRadius: 8,
    background: cor + "22",
    border: `1px solid ${cor}55`,
    color: cor,
    fontSize: 13,
  };
}

const mpBtnPrimario: CSSProperties = {
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 20px",
  fontWeight: 700,
  fontSize: 13,
};

const mpBtnPerigo: CSSProperties = {
  background: "transparent",
  border: `1px solid ${C.red}55`,
  color: C.red,
  borderRadius: 8,
  padding: "10px 18px",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-gp-muted text-[11px] font-extrabold tracking-[0.5px] mb-[10px] pb-[6px] border-b border-gp-border">
        {titulo.toUpperCase()}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Campo({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div>
      {label && (
        <label className="block text-gp-muted text-[11px] mb-1 font-semibold">{label}</label>
      )}
      {children}
    </div>
  );
}

interface OpcaoCaixaProps {
  marcada: boolean;
  disabled: boolean;
  titulo: string;
  icone: string;
  descricao: string;
  onSelecionar: () => void;
}

function OpcaoCaixa({ marcada, disabled, titulo, icone, descricao, onSelecionar }: OpcaoCaixaProps) {
  const corBorda = marcada ? C.accent : C.border;
  const fundo = marcada ? `linear-gradient(135deg, ${C.accent}22, ${C.purple}22)` : C.surface;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelecionar}
      disabled={disabled}
      className="rounded-[10px] px-[14px] py-3 text-left flex gap-[10px] items-start"
      style={{
        background: fundo,
        border: `2px solid ${corBorda}${marcada ? "" : "55"}`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled && !marcada ? 0.6 : 1,
      }}
    >
      <div
        className="rounded-full shrink-0 mt-[2px]"
        style={{
          width: 18, height: 18,
          border: `2px solid ${marcada ? C.accent : C.muted}`,
          background: marcada ? C.accent : "transparent",
          boxShadow: marcada ? `inset 0 0 0 3px ${C.card}` : "none",
        }}
      />
      <div>
        <div className="font-bold text-[13px] mb-1" style={{ color: marcada ? C.white : C.text }}>
          {icone} {titulo}
        </div>
        <div className="text-gp-muted text-[11px] leading-[1.4]">{descricao}</div>
      </div>
    </button>
  );
}

function inputStyle(habilitado: boolean = true): CSSProperties {
  return {
    width: "100%",
    background: habilitado ? C.surface : C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "9px 12px",
    color: habilitado ? C.text : C.muted,
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    cursor: habilitado ? "text" : "not-allowed",
  };
}

function alertStyle(cor: string): CSSProperties {
  return {
    marginBottom: 12,
    padding: "10px 14px",
    borderRadius: 8,
    background: cor + "22",
    border: `1px solid ${cor}55`,
    color: cor,
    fontSize: 13,
  };
}

const btnSecundario: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: 6,
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const btnPerigo: CSSProperties = {
  background: "transparent",
  border: `1px solid ${C.red}55`,
  color: C.red,
  borderRadius: 6,
  padding: "5px 12px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};
