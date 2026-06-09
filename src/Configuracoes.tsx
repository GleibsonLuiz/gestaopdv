import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { C } from "./lib/theme";
import { api, BASE_URL, type SessionUser } from "./lib/api";
import { invalidarCacheConfiguracao } from "./HeaderRelatorio";

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
  // Data URI (logo embutido no banco) ou URL absoluta (Vercel Blob): usa direto.
  if (/^(data:|https?:\/\/)/i.test(logotipo)) return logotipo;
  // Caminho relativo (/uploads em dev): prefixa o host da API.
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
  const [enviandoLogo, setEnviandoLogo] = useState(false);
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
    // Formatos rasterizados apenas — alinhado ao backend (SVG e' rejeitado por
    // poder carregar script/XSS). PNG preserva transparencia, ideal p/ logo.
    if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) {
      setErro("Formato não suportado. Envie um arquivo PNG, JPG ou WEBP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setErro(`Logotipo muito grande (${mb}MB). O limite é 2MB — use uma imagem menor.`);
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
      invalidarCacheConfiguracao();
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
        setEnviandoLogo(true);
        try {
          const cfg = await api.enviarLogotipo(logoFile) as ConfiguracaoEmpresa;
          setLogotipoAtual(cfg.logotipo || null);
          setLogoFile(null);
          if (inputLogoRef.current) inputLogoRef.current.value = "";
          // Troca o preview local (blob:) pela URL canonica devolvida pelo
          // servidor — assim o que aparece na tela e' exatamente o que foi
          // persistido (e o que os relatorios vao renderizar).
          setLogoPreview((prev) => {
            if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
            return urlLogotipo(cfg.logotipo);
          });
        } catch (errLogo) {
          invalidarCacheConfiguracao();
          setErro(`Dados salvos, mas o logotipo falhou: ${(errLogo as Error).message}`);
          setEnviandoLogo(false);
          setSalvando(false);
          return;
        } finally {
          setEnviandoLogo(false);
        }
      }
      // Header/cupom/PDFs leem config via cache de 30s — invalida para refletir
      // qualquer mudanca (nome, endereco, logo) imediatamente.
      invalidarCacheConfiguracao();
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
        <div className="grid gap-4" style={{ gridTemplateColumns: "180px 1fr" }}>
          {/* COLUNA ESQUERDA: LOGO */}
          <div className="bg-gp-card border border-gp-border rounded-xl p-3 flex flex-col gap-2 items-center">
            <div className="text-gp-muted text-[11px] font-bold tracking-[0.4px]">
              LOGOTIPO
            </div>
            <div
              onClick={() => podeEditar && !enviandoLogo && inputLogoRef.current?.click()}
              className="w-[148px] h-[148px] rounded-xl bg-gp-surface flex items-center justify-center overflow-hidden relative"
              style={{
                border: `2px dashed ${C.border}`,
                cursor: podeEditar && !enviandoLogo ? "pointer" : "default",
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
              {/* Overlay de envio — feedback visual claro durante o upload. */}
              {enviandoLogo && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-gp-white text-[11px] font-bold"
                  style={{ background: "rgba(0,0,0,0.6)" }}
                >
                  <div className="text-[22px] animate-pulse">⏳</div>
                  Enviando…
                </div>
              )}
            </div>
            {podeEditar && (
              <>
                <input
                  ref={inputLogoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => escolherLogo(e.target.files?.[0])}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => inputLogoRef.current?.click()}
                  disabled={enviandoLogo}
                  style={{ ...btnSecundario, opacity: enviandoLogo ? 0.6 : 1 }}
                >
                  {logoPreview ? "Trocar" : "Escolher arquivo"}
                </button>
                {logoPreview && !enviandoLogo && (
                  <button type="button" onClick={removerLogoAtual} style={btnPerigo}>
                    Remover
                  </button>
                )}
                {logoFile && !enviandoLogo && (
                  <div className="text-center text-[10px] font-semibold" style={{ color: C.yellow }}>
                    Selecionado — clique em “Salvar” para aplicar
                  </div>
                )}
                <div className="text-gp-muted text-[10px] text-center leading-[1.4]">
                  PNG / JPG / WEBP · máx 2 MB<br />
                  <span style={{ opacity: 0.7 }}>ideal: fundo transparente (PNG)</span>
                </div>
              </>
            )}
          </div>

          {/* COLUNA DIREITA: FORMULARIO */}
          <div className="bg-gp-card border border-gp-border rounded-xl p-4">
            <Secao titulo="Identificação">
              <div className="grid gap-2" style={{ gridTemplateColumns: "2fr 2fr 1.2fr 1fr" }}>
                <Campo label="Razão social *">
                  <input
                    value={form.razaoSocial}
                    onChange={(e) => setForm((f) => ({ ...f, razaoSocial: e.target.value.toUpperCase() }))}
                    disabled={!podeEditar}
                    required
                    style={inputStyle(podeEditar)}
                  />
                </Campo>
                <Campo label="Nome fantasia">
                  <input
                    value={form.nomeFantasia}
                    onChange={(e) => setForm((f) => ({ ...f, nomeFantasia: e.target.value.toUpperCase() }))}
                    disabled={!podeEditar}
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
              <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
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
              <div className="grid gap-2" style={{ gridTemplateColumns: "2.4fr 0.7fr 1.4fr 1.4fr 0.5fr 1fr" }}>
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
              <div className="flex justify-end mt-3">
                <button
                  type="submit"
                  disabled={salvando}
                  className="text-gp-white border-none rounded-lg px-5 py-2 font-bold text-sm"
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
          className="mt-4 p-3 rounded-[10px] flex items-center gap-3"
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

      {/* BOLETO + PIX (ASAAS) — card separado com submit proprio
          (PUT /boletos/config). A API Key vai cifrada; o GET devolve mascarada.
          Cobra o CLIENTE FINAL pela conta Asaas do lojista. */}
      <BlocoBoletoAsaas podeEditar={podeEditar} />

      {/* EMISSAO FISCAL NFC-e (modelo 65) — card separado com submit proprio
          (PUT /fiscal/config). O CSC vai cifrado pelo backend e o GET sempre
          devolve mascarado. fiscalAtivo so liga com a prontidao completa. */}
      <BlocoFiscalNfce podeEditar={podeEditar} />
    </div>
  );
}

// ============ EMISSAO FISCAL NFC-e (modelo 65) ============
//
// Dados do emitente especificos da nota fiscal (CRT, codigos IBGE, serie,
// CSC, provedor). Complementa a Identificacao/Endereco do formulario acima,
// que ja gravam razaoSocial/cnpj/inscEstadual/endereco em ConfiguracaoEmpresa.

interface ProntidaoFiscal {
  pronta: boolean;
  faltando: string[];
}

interface ConfigFiscalResposta {
  fiscalAtivo: boolean;
  ambienteFiscal: "HOMOLOGACAO" | "PRODUCAO";
  provedorFiscal: string | null;
  crt: number | null;
  cnae: string | null;
  inscMunicipal: string | null;
  ieSubstitutoTrib: string | null;
  regimeEspecialISSQN: number | null;
  codMunicipioIBGE: string | null;
  codUFIBGE: string | null;
  codPais: string;
  nomePais: string;
  serieNfce: number;
  proximoNumeroNfce: number;
  cscId: string | null;
  cscMascarado: string | null;
  certificadoRef: string | null;
  prontidao: ProntidaoFiscal;
  // NFS-e (servicos / ISS)
  nfseAtivo: boolean;
  serieNfse: number;
  proximoNumeroNfse: number;
  itemListaServicoPadrao: string | null;
  codTributacaoMunicipioPadrao: string | null;
  aliquotaIssPadrao: number | null;
  prontidaoNfse: ProntidaoFiscal;
}

const PROVEDORES_FISCAIS = [
  { valor: "mock", nome: "Simulador (testes — sem valor fiscal)" },
  { valor: "nuvemfiscal", nome: "NuvemFiscal" },
  { valor: "focusnfe", nome: "Focus NFe" },
  { valor: "plugnotas", nome: "PlugNotas" },
];

function BlocoFiscalNfce({ podeEditar }: { podeEditar: boolean }) {
  const [carregando, setCarregando] = useState(true);
  const [cfg, setCfg] = useState<ConfigFiscalResposta | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [faltando, setFaltando] = useState<string[]>([]);

  // Campos editaveis. cscInput vazio = "manter o atual" (so envia se digitar).
  const [provedor, setProvedor] = useState("");
  const [ambiente, setAmbiente] = useState<"HOMOLOGACAO" | "PRODUCAO">("HOMOLOGACAO");
  const [crt, setCrt] = useState("");
  const [cnae, setCnae] = useState("");
  const [inscMunicipal, setInscMunicipal] = useState("");
  const [codMun, setCodMun] = useState("");
  const [codUf, setCodUf] = useState("");
  const [serie, setSerie] = useState("1");
  const [proxNum, setProxNum] = useState("1");
  const [cscInput, setCscInput] = useState("");
  const [cscId, setCscId] = useState("");
  const [ativo, setAtivo] = useState(false);
  // NFS-e (servicos / ISS)
  const [nfseAtivo, setNfseAtivo] = useState(false);
  const [serieNfse, setSerieNfse] = useState("1");
  const [proxNumNfse, setProxNumNfse] = useState("1");
  const [itemLC116, setItemLC116] = useState("");
  const [codTribMun, setCodTribMun] = useState("");
  const [aliqIss, setAliqIss] = useState("");
  const [faltandoNfse, setFaltandoNfse] = useState<string[]>([]);

  function aplicar(c: ConfigFiscalResposta) {
    setCfg(c);
    setProvedor(c.provedorFiscal || "");
    setAmbiente(c.ambienteFiscal || "HOMOLOGACAO");
    setCrt(c.crt != null ? String(c.crt) : "");
    setCnae(c.cnae || "");
    setInscMunicipal(c.inscMunicipal || "");
    setCodMun(c.codMunicipioIBGE || "");
    setCodUf(c.codUFIBGE || "");
    setSerie(String(c.serieNfce ?? 1));
    setProxNum(String(c.proximoNumeroNfce ?? 1));
    setCscId(c.cscId || "");
    setAtivo(!!c.fiscalAtivo);
    setFaltando(c.prontidao?.faltando || []);
    setNfseAtivo(!!c.nfseAtivo);
    setSerieNfse(String(c.serieNfse ?? 1));
    setProxNumNfse(String(c.proximoNumeroNfse ?? 1));
    setItemLC116(c.itemListaServicoPadrao || "");
    setCodTribMun(c.codTributacaoMunicipioPadrao || "");
    setAliqIss(c.aliquotaIssPadrao != null ? String(c.aliquotaIssPadrao) : "");
    setFaltandoNfse(c.prontidaoNfse?.faltando || []);
  }

  function carregar() {
    setCarregando(true);
    api.obterConfigFiscal()
      .then((raw) => aplicar(raw as ConfigFiscalResposta))
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
        provedorFiscal: provedor || null,
        ambienteFiscal: ambiente,
        crt: crt ? Number(crt) : null,
        cnae: cnae.trim() || null,
        inscMunicipal: inscMunicipal.trim() || null,
        codMunicipioIBGE: codMun.trim() || null,
        codUFIBGE: codUf.trim() || null,
        serieNfce: Number(serie) || 0,
        proximoNumeroNfce: Number(proxNum) || 1,
        cscId: cscId.trim() || null,
        fiscalAtivo: ativo,
        // NFS-e
        nfseAtivo,
        serieNfse: Number(serieNfse) || 0,
        proximoNumeroNfse: Number(proxNumNfse) || 1,
        itemListaServicoPadrao: itemLC116.trim() || null,
        codTributacaoMunicipioPadrao: codTribMun.trim() || null,
        aliquotaIssPadrao: aliqIss.trim() === "" ? null : Number(aliqIss),
      };
      if (cscInput.trim()) body.csc = cscInput.trim();
      const resp = await api.salvarConfigFiscal(body) as ConfigFiscalResposta;
      aplicar(resp);
      setCscInput("");
      flash("Configuração fiscal salva");
    } catch (err) {
      // O backend devolve { erro, faltando? } quando bloqueia a ativacao.
      // O body completo chega em ApiError.data; a mensagem em .message.
      const e = err as { message: string; data?: { faltando?: string[] } };
      const lista = e.data?.faltando;
      if (Array.isArray(lista) && lista.length) { setFaltando(lista); setFaltandoNfse(lista); }
      setErro(e.message);
      setAtivo(cfg?.fiscalAtivo ?? false); // reverte o toggle otimista
      setNfseAtivo(cfg?.nfseAtivo ?? false);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div className="mt-4 p-5 rounded-xl border" style={{ background: C.card, borderColor: C.border }}>
        <div className="text-gp-muted text-[12px]">Carregando configuração fiscal…</div>
      </div>
    );
  }

  const pronta = cfg?.prontidao?.pronta;

  return (
    <div className="mt-4 p-4 rounded-xl border" style={{ background: C.card, borderColor: C.border }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-gp-white font-extrabold text-[15px] flex items-center gap-2">
            🧾 EMISSÃO FISCAL — NFC-e (modelo 65)
            {cfg?.fiscalAtivo && (
              <span style={badge(C.green)}>ATIVA · {cfg.ambienteFiscal === "PRODUCAO" ? "PRODUÇÃO" : "HOMOLOGAÇÃO"}</span>
            )}
            {!cfg?.fiscalAtivo && pronta && <span style={badge(C.yellow)}>PRONTA · DESLIGADA</span>}
            {!cfg?.fiscalAtivo && !pronta && <span style={badge(C.muted)}>NÃO CONFIGURADA</span>}
          </div>
          <div className="text-gp-muted text-[12px] mt-[2px]">
            Emissão da Nota Fiscal de Consumidor eletrônica via gateway fiscal.
            Os dados da empresa (razão social, CNPJ, IE, endereço) vêm do formulário acima.
          </div>
        </div>
      </div>

      {msg && <div style={mpAlert(C.green)}>{msg}</div>}
      {erro && <div style={mpAlert(C.red)}>{erro}</div>}

      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label className="block text-gp-muted text-[11px] mb-1 font-semibold">Provedor fiscal (gateway)</label>
          <select title="Provedor fiscal (gateway)" value={provedor} onChange={(e) => setProvedor(e.target.value)} disabled={!podeEditar} style={mpInput(podeEditar)}>
            <option value="">— Selecione —</option>
            {PROVEDORES_FISCAIS.map((p) => <option key={p.valor} value={p.valor}>{p.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-gp-muted text-[11px] mb-1 font-semibold">Ambiente</label>
          <select title="Ambiente fiscal" value={ambiente} onChange={(e) => setAmbiente(e.target.value as "HOMOLOGACAO" | "PRODUCAO")} disabled={!podeEditar} style={mpInput(podeEditar)}>
            <option value="HOMOLOGACAO">Homologação (testes, sem valor fiscal)</option>
            <option value="PRODUCAO">Produção (notas reais)</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
        <div>
          <label className="block text-gp-muted text-[11px] mb-1 font-semibold">Regime tributário (CRT)</label>
          <select title="Regime tributário (CRT)" value={crt} onChange={(e) => setCrt(e.target.value)} disabled={!podeEditar} style={mpInput(podeEditar)}>
            <option value="">— Selecione —</option>
            <option value="1">1 — Simples Nacional</option>
            <option value="2">2 — Simples Nacional / Excesso de sublimite</option>
            <option value="3">3 — Regime Normal</option>
          </select>
        </div>
        <div>
          <label className="block text-gp-muted text-[11px] mb-1 font-semibold">CNAE (opcional)</label>
          <input value={cnae} onChange={(e) => setCnae(e.target.value)} disabled={!podeEditar} placeholder="7 dígitos" style={mpInput(podeEditar)} />
        </div>
        <div>
          <label className="block text-gp-muted text-[11px] mb-1 font-semibold">Inscrição municipal (opcional)</label>
          <input value={inscMunicipal} onChange={(e) => setInscMunicipal(e.target.value)} disabled={!podeEditar} style={mpInput(podeEditar)} />
        </div>
      </div>

      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "1.4fr 0.8fr 0.8fr 0.8fr" }}>
        <div>
          <label className="block text-gp-muted text-[11px] mb-1 font-semibold">Código IBGE do município</label>
          <input value={codMun} onChange={(e) => setCodMun(e.target.value)} disabled={!podeEditar} placeholder="7 dígitos (ex.: 2927408 Salvador)" style={mpInput(podeEditar)} />
        </div>
        <div>
          <label className="block text-gp-muted text-[11px] mb-1 font-semibold">Cód. UF (IBGE)</label>
          <input value={codUf} onChange={(e) => setCodUf(e.target.value)} disabled={!podeEditar} placeholder="BA = 29" style={mpInput(podeEditar)} />
        </div>
        <div>
          <label className="block text-gp-muted text-[11px] mb-1 font-semibold">Série</label>
          <input title="Série da NFC-e" placeholder="1" value={serie} onChange={(e) => setSerie(e.target.value.replace(/\D/g, ""))} disabled={!podeEditar} style={mpInput(podeEditar)} />
        </div>
        <div>
          <label className="block text-gp-muted text-[11px] mb-1 font-semibold">Próximo número</label>
          <input title="Próximo número da NFC-e" placeholder="1" value={proxNum} onChange={(e) => setProxNum(e.target.value.replace(/\D/g, ""))} disabled={!podeEditar} style={mpInput(podeEditar)} />
        </div>
      </div>

      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        <div>
          <label className="block text-gp-muted text-[11px] mb-1 font-semibold">CSC (Código de Segurança do Contribuinte)</label>
          <input
            type="password"
            value={cscInput}
            onChange={(e) => setCscInput(e.target.value)}
            disabled={!podeEditar}
            autoComplete="off"
            placeholder={cfg?.cscMascarado ? `Atual: ${cfg.cscMascarado}` : "16 a 36 caracteres (não preencha para manter)"}
            style={mpInput(podeEditar)}
          />
          <div className="text-gp-muted text-[10px] mt-1">
            Gerado no portal da SEFAZ-BA. Usado no hash do QR Code. Guardado cifrado (AES-256-GCM) e nunca volta ao navegador.
            <b> Homologação e produção usam CSC diferentes.</b>
          </div>
        </div>
        <div>
          <label className="block text-gp-muted text-[11px] mb-1 font-semibold">ID do CSC</label>
          <input value={cscId} onChange={(e) => setCscId(e.target.value.replace(/\D/g, ""))} disabled={!podeEditar} placeholder="Ex.: 1" style={mpInput(podeEditar)} />
        </div>
      </div>

      {/* Prontidao: lista o que falta para poder ativar */}
      {faltando.length > 0 && (
        <div className="mt-3 p-3 rounded-[10px]" style={{ background: C.yellow + "11", border: `1px solid ${C.yellow}44`, fontSize: 12, color: C.text }}>
          <b style={{ color: C.yellow }}>Pendências para ativar a emissão:</b>
          <ul style={{ marginTop: 6, paddingLeft: 18 }}>
            {faltando.map((f) => <li key={f}>{f}</li>)}
          </ul>
          <div className="text-gp-muted text-[11px] mt-1">
            Campos de empresa/endereço são preenchidos no formulário acima e salvos com "Salvar configurações".
          </div>
        </div>
      )}

      <div className="mt-3">
        <label className="flex items-center gap-2" style={{ opacity: podeEditar ? 1 : 0.6, cursor: podeEditar ? "pointer" : "not-allowed" }}>
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} disabled={!podeEditar} style={{ width: 18, height: 18 }} />
          <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>Emissão fiscal ativa</span>
          <span style={{ color: C.muted, fontSize: 11, marginLeft: 4 }}>(o PDV passa a emitir NFC-e nas vendas)</span>
        </label>
      </div>

      {/* ============ NFS-e (servicos / ISS) ============ */}
      <div className="mt-4 pt-4" style={{ borderTop: `1px dashed ${C.border}` }}>
        <div className="text-gp-white font-extrabold text-[14px] flex items-center gap-2 mb-1">
          🧰 NFS-e (serviços)
          {cfg?.nfseAtivo && <span style={badge(C.green)}>ATIVA</span>}
          {!cfg?.nfseAtivo && cfg?.prontidaoNfse?.pronta && <span style={badge(C.yellow)}>PRONTA · DESLIGADA</span>}
          {!cfg?.nfseAtivo && !cfg?.prontidaoNfse?.pronta && <span style={badge(C.muted)}>NÃO CONFIGURADA</span>}
        </div>
        <div className="text-gp-muted text-[12px] mb-3">
          Nota fiscal de serviço (ISS, municipal). Usa o mesmo provedor, ambiente, CRT, inscrição municipal
          e código IBGE configurados acima. Emita pela <b>Ordem de Serviço</b> ou avulsa na tela <b>Notas Fiscais</b>.
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 0.8fr 0.8fr" }}>
          <div>
            <label className="block text-gp-muted text-[11px] mb-1 font-semibold">Item da lista de serviços (LC 116)</label>
            <input value={itemLC116} onChange={(e) => setItemLC116(e.target.value)} disabled={!podeEditar} placeholder="ex.: 1401" style={mpInput(podeEditar)} />
          </div>
          <div>
            <label className="block text-gp-muted text-[11px] mb-1 font-semibold">Cód. tributação município (opcional)</label>
            <input value={codTribMun} onChange={(e) => setCodTribMun(e.target.value)} disabled={!podeEditar} placeholder="código do serviço na prefeitura" style={mpInput(podeEditar)} />
          </div>
          <div>
            <label className="block text-gp-muted text-[11px] mb-1 font-semibold">Alíquota ISS (%)</label>
            <input value={aliqIss} onChange={(e) => setAliqIss(e.target.value.replace(",", "."))} disabled={!podeEditar} placeholder="ex.: 5" inputMode="decimal" style={mpInput(podeEditar)} />
          </div>
          <div>
            <label className="block text-gp-muted text-[11px] mb-1 font-semibold">Série / Próx. nº</label>
            <div className="flex gap-1">
              <input title="Série da NFS-e" value={serieNfse} onChange={(e) => setSerieNfse(e.target.value.replace(/\D/g, ""))} disabled={!podeEditar} placeholder="1" style={mpInput(podeEditar)} />
              <input title="Próximo número da NFS-e" value={proxNumNfse} onChange={(e) => setProxNumNfse(e.target.value.replace(/\D/g, ""))} disabled={!podeEditar} placeholder="1" style={mpInput(podeEditar)} />
            </div>
          </div>
        </div>

        {faltandoNfse.length > 0 && !cfg?.nfseAtivo && (
          <div className="mt-3 p-3 rounded-[10px]" style={{ background: C.yellow + "11", border: `1px solid ${C.yellow}44`, fontSize: 12, color: C.text }}>
            <b style={{ color: C.yellow }}>Pendências para ativar a NFS-e:</b>
            <ul style={{ marginTop: 6, paddingLeft: 18 }}>
              {faltandoNfse.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </div>
        )}

        <div className="mt-3">
          <label className="flex items-center gap-2" style={{ opacity: podeEditar ? 1 : 0.6, cursor: podeEditar ? "pointer" : "not-allowed" }}>
            <input type="checkbox" checked={nfseAtivo} onChange={(e) => setNfseAtivo(e.target.checked)} disabled={!podeEditar} style={{ width: 18, height: 18 }} />
            <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>Emissão de NFS-e ativa</span>
            <span style={{ color: C.muted, fontSize: 11, marginLeft: 4 }}>(habilita o botão "Emitir NFS-e")</span>
          </label>
        </div>
      </div>

      {podeEditar && (
        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            style={{ ...mpBtnPrimario, background: salvando ? C.muted : `linear-gradient(135deg, ${C.accent}, ${C.purple})`, cursor: salvando ? "default" : "pointer" }}
          >
            {salvando ? "Salvando…" : "💾 Salvar configuração fiscal"}
          </button>
        </div>
      )}
    </div>
  );
}

function badge(cor: string): CSSProperties {
  return {
    fontSize: 10, padding: "2px 8px", borderRadius: 999,
    background: cor + "22", color: cor, border: `1px solid ${cor}55`,
  };
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

interface DispositivoMp {
  id: string;
  operatingMode: string | null;
  storeId: string | null;
  posId: string | null;
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
  const [buscandoDevs, setBuscandoDevs] = useState(false);
  const [devicesMp, setDevicesMp] = useState<DispositivoMp[] | null>(null);
  const [erroDevs, setErroDevs] = useState("");

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

  async function buscarDispositivos() {
    setErroDevs("");
    setBuscandoDevs(true);
    try {
      const resp = await api.listarDevicesMp() as { devices: DispositivoMp[] };
      setDevicesMp(resp.devices || []);
    } catch (err) {
      setErroDevs((err as Error).message);
      setDevicesMp([]);
    } finally {
      setBuscandoDevs(false);
    }
  }

  function escolherDispositivo(id: string) {
    setDeviceInput(id);
    setDevicesMp(null);
    setErroDevs("");
    flash("DEVICE_ID preenchido. Clique em Salvar para aplicar.");
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
      className="mt-4 p-4 rounded-xl border"
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
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={deviceInput}
              onChange={(e) => setDeviceInput(e.target.value)}
              disabled={!podeEditar}
              placeholder="Ex.: PAX_A910__SMART... ou GERTEC_MP35P..."
              style={{ ...mpInput(podeEditar), flex: 1 }}
            />
            <button
              type="button"
              onClick={buscarDispositivos}
              disabled={!podeEditar || buscandoDevs || !cfg?.mpAccessTokenMascarado}
              title={!cfg?.mpAccessTokenMascarado
                ? "Salve o ACCESS_TOKEN antes para conseguir listar"
                : "Lista os dispositivos vinculados a esta conta MP"}
              style={{
                padding: "0 12px",
                borderRadius: 8,
                border: `1px solid ${C.accent}55`,
                background: C.accent + "22",
                color: C.accent,
                fontWeight: 700,
                fontSize: 12,
                cursor: (!podeEditar || buscandoDevs || !cfg?.mpAccessTokenMascarado) ? "not-allowed" : "pointer",
                opacity: (!podeEditar || !cfg?.mpAccessTokenMascarado) ? 0.55 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {buscandoDevs ? "Buscando…" : "🔎 Buscar"}
            </button>
          </div>
          <div className="text-gp-muted text-[10px] mt-1">
            Clique em <b>Buscar</b> para listar as maquininhas da sua conta MP,
            ou cole manualmente o ID no formato <code>MODELO__SERIAL</code>.
          </div>

          {erroDevs && (
            <div style={{
              marginTop: 8, padding: "6px 10px", borderRadius: 6,
              background: C.red + "22", border: `1px solid ${C.red}55`,
              color: C.red, fontSize: 11,
            }}>{erroDevs}</div>
          )}

          {devicesMp && (
            <div style={{
              marginTop: 8, padding: 8, borderRadius: 8,
              background: C.surface, border: `1px solid ${C.border}`,
            }}>
              {devicesMp.length === 0 && (
                <div style={{ color: C.muted, fontSize: 12, padding: "4px 6px" }}>
                  Nenhum dispositivo encontrado nesta conta MP.
                </div>
              )}
              {devicesMp.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => escolherDispositivo(d.id)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    width: "100%", padding: "8px 10px", marginBottom: 4,
                    border: `1px solid ${deviceInput === d.id ? C.accent : C.border}`,
                    background: deviceInput === d.id ? C.accent + "11" : C.card,
                    borderRadius: 6, cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span style={{ fontFamily: "monospace", fontSize: 12, color: C.text }}>
                    {d.id}
                  </span>
                  {d.operatingMode && (
                    <span style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 999,
                      background: C.muted + "22", color: C.muted,
                    }}>{d.operatingMode}</span>
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setDevicesMp(null); setErroDevs(""); }}
                style={{
                  marginTop: 4, fontSize: 11, color: C.muted,
                  background: "transparent", border: "none", cursor: "pointer",
                }}
              >fechar</button>
            </div>
          )}
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

// ============ BOLETO HIBRIDO (BOLETO + PIX) — ASAAS ============
//
// Credencial Asaas DO LOJISTA (por-tenant). Card separado com submit proprio
// (PUT /boletos/config). A API Key vai cifrada pelo backend e o GET sempre
// devolve mascarada. asaasAtivo so faz sentido com credencial salva. Mostra a
// URL do webhook (com o secret) para o lojista colar no painel do Asaas.

interface ConfigBoletoResposta {
  configurada: boolean;
  asaasAtivo: boolean;
  asaasAmbiente: "sandbox" | "producao";
  asaasApiKeyMascarada: string | null;
  repassarTaxaBoleto: boolean;
  valorTaxaBoleto: number | null;
  webhookUrl: string | null;
}

function BlocoBoletoAsaas({ podeEditar }: { podeEditar: boolean }) {
  const [carregando, setCarregando] = useState(true);
  const [cfg, setCfg] = useState<ConfigBoletoResposta | null>(null);
  const [keyInput, setKeyInput] = useState(""); // vazio = manter atual
  const [ambiente, setAmbiente] = useState<"sandbox" | "producao">("sandbox");
  const [ativo, setAtivo] = useState(false);
  const [repassar, setRepassar] = useState(false);
  const [valorTaxa, setValorTaxa] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [copiado, setCopiado] = useState(false);

  function carregar() {
    setCarregando(true);
    api.obterConfigBoleto()
      .then((raw) => {
        const c = raw as ConfigBoletoResposta;
        setCfg(c);
        setAmbiente(c?.asaasAmbiente === "producao" ? "producao" : "sandbox");
        setAtivo(!!c?.asaasAtivo);
        setRepassar(!!c?.repassarTaxaBoleto);
        setValorTaxa(c?.valorTaxaBoleto != null ? String(c.valorTaxaBoleto) : "");
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
        asaasAmbiente: ambiente,
        asaasAtivo: ativo,
        repassarTaxaBoleto: repassar,
        valorTaxaBoleto: repassar && valorTaxa.trim() ? Number(valorTaxa.replace(",", ".")) : null,
      };
      if (keyInput.trim()) body.asaasApiKey = keyInput.trim();
      const resp = await api.salvarConfigBoleto(body) as ConfigBoletoResposta;
      // Recarrega para obter a webhookUrl (gerada quando salva a 1a credencial).
      setKeyInput("");
      setCfg((prev) => ({ ...(prev as ConfigBoletoResposta), ...resp }));
      setAtivo(resp.asaasAtivo);
      flash("Configuração do boleto salva");
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function removerCredencial() {
    if (!confirm("Remover a credencial do Asaas? O sistema deixará de emitir boletos.")) return;
    setSalvando(true);
    try {
      const resp = await api.salvarConfigBoleto({ asaasApiKey: "", asaasAtivo: false }) as ConfigBoletoResposta;
      setCfg(resp);
      setKeyInput("");
      setAtivo(false);
      flash("Credencial removida");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function copiarWebhook() {
    if (!cfg?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(cfg.webhookUrl);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não foi possível copiar — selecione manualmente.");
    }
  }

  if (carregando) {
    return (
      <div className="mt-4 p-5 rounded-xl border" style={{ background: C.card, borderColor: C.border }}>
        <div className="text-gp-muted text-[12px]">Carregando configuração de boleto…</div>
      </div>
    );
  }

  return (
    <div className="mt-4 p-4 rounded-xl border" style={{ background: C.card, borderColor: C.border }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-gp-white font-extrabold text-[15px] flex items-center gap-2">
          🧾 BOLETO + PIX (ASAAS)
          {cfg?.configurada && cfg?.asaasAtivo && (
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: C.green + "22", color: C.green, border: `1px solid ${C.green}55` }}>ATIVO</span>
          )}
          {cfg?.configurada && !cfg?.asaasAtivo && (
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: C.yellow + "22", color: C.yellow, border: `1px solid ${C.yellow}55` }}>CONFIGURADO · PAUSADO</span>
          )}
          {cfg?.asaasAmbiente === "sandbox" && cfg?.configurada && (
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: C.accent + "22", color: C.accent, border: `1px solid ${C.accent}55` }}>SANDBOX</span>
          )}
        </div>
      </div>

      <div className="text-gp-muted text-[12px] mb-3 leading-[1.5]">
        Emite boletos híbridos (boleto + PIX) pela sua conta Asaas para cobrar
        seus clientes. O dinheiro cai direto na sua conta Asaas.
      </div>

      {msg && <div style={mpAlert(C.green)}>{msg}</div>}
      {erro && <div style={mpAlert(C.red)}>{erro}</div>}

      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="block text-gp-muted text-[11px] mb-1 font-semibold">API Key do Asaas</label>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            disabled={!podeEditar}
            placeholder={cfg?.asaasApiKeyMascarada ? `Atual: ${cfg.asaasApiKeyMascarada}` : "$aact_..."}
            style={mpInput(podeEditar)}
          />
          <div className="text-gp-muted text-[11px] mt-1 leading-[1.5]">
            Obtida em <b>Asaas &gt; Configurações &gt; Integrações &gt; Chave de API</b>.
            Deixe em branco para manter a atual.
          </div>
        </div>

        <div>
          <label className="block text-gp-muted text-[11px] mb-1 font-semibold">Ambiente</label>
          <select
            value={ambiente}
            onChange={(e) => setAmbiente(e.target.value as "sandbox" | "producao")}
            disabled={!podeEditar}
            aria-label="Ambiente Asaas"
            style={mpInput(podeEditar)}
          >
            <option value="sandbox">Sandbox (teste)</option>
            <option value="producao">Produção</option>
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <label className="flex items-center gap-2" style={{ opacity: podeEditar ? 1 : 0.6, cursor: podeEditar ? "pointer" : "not-allowed" }}>
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} disabled={!podeEditar} style={{ width: 18, height: 18 }} />
          <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>Emissão de boleto ativa</span>
          <span style={{ color: C.muted, fontSize: 11, marginLeft: 4 }}>(habilita o botão no Financeiro)</span>
        </label>

        <label className="flex items-center gap-2" style={{ opacity: podeEditar ? 1 : 0.6, cursor: podeEditar ? "pointer" : "not-allowed" }}>
          <input type="checkbox" checked={repassar} onChange={(e) => setRepassar(e.target.checked)} disabled={!podeEditar} style={{ width: 18, height: 18 }} />
          <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>Repassar a taxa do boleto ao cliente</span>
          <span style={{ color: C.muted, fontSize: 11, marginLeft: 4 }}>(soma ao valor cobrado)</span>
        </label>

        {repassar && (
          <div style={{ maxWidth: 220, marginLeft: 26 }}>
            <label className="block text-gp-muted text-[11px] mb-1 font-semibold">Valor da taxa (R$)</label>
            <input
              type="number" min="0" step="0.01"
              value={valorTaxa}
              onChange={(e) => setValorTaxa(e.target.value)}
              disabled={!podeEditar}
              placeholder="2.49"
              style={mpInput(podeEditar)}
            />
          </div>
        )}
      </div>

      {/* URL do webhook — o lojista cola no painel do Asaas para receber a
          confirmação de pagamento (o secret embutido autentica e roteia). */}
      {cfg?.webhookUrl && (
        <div className="mt-4 p-3 rounded-[10px]" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="text-gp-muted text-[11px] font-bold mb-1">URL DO WEBHOOK (cole no Asaas)</div>
          <div style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 11, color: C.text, wordBreak: "break-all", lineHeight: 1.5 }}>
            {cfg.webhookUrl}
          </div>
          <button type="button" onClick={copiarWebhook} style={{ ...btnSecundario, marginTop: 8, ...(copiado ? { background: C.green, color: "#fff", borderColor: C.green } : {}) }}>
            {copiado ? "✓ Copiada!" : "📋 Copiar URL"}
          </button>
        </div>
      )}

      {podeEditar && (
        <div className="flex justify-end gap-2 mt-4">
          {cfg?.configurada && (
            <button type="button" onClick={removerCredencial} disabled={salvando} style={mpBtnPerigo}>
              Remover credencial
            </button>
          )}
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            style={{ ...mpBtnPrimario, background: salvando ? C.muted : `linear-gradient(135deg, ${C.accent}, ${C.purple})`, cursor: salvando ? "default" : "pointer" }}
          >
            {salvando ? "Salvando…" : "💾 Salvar boleto"}
          </button>
        </div>
      )}

      {!cfg?.configurada && (
        <div className="mt-4 p-3 rounded-[10px]" style={{ background: C.accent + "11", border: `1px solid ${C.accent}33`, fontSize: 12, color: C.text, lineHeight: 1.5 }}>
          <b style={{ color: C.accent }}>Como configurar pela primeira vez:</b>
          <ol style={{ marginTop: 6, paddingLeft: 18 }}>
            <li>Crie uma conta no <b>Asaas</b> (sandbox para testar: <code>sandbox.asaas.com</code>).</li>
            <li>Em <b>Configurações &gt; Integrações &gt; Chave de API</b>, copie a chave (começa com <code>$aact_</code>).</li>
            <li>Cole aqui, escolha o ambiente, marque "ativa" e salve.</li>
            <li>Copie a <b>URL do webhook</b> que aparecerá e cole em <b>Asaas &gt; Configurações &gt; Webhooks</b> (eventos de <i>cobrança/pagamento</i>).</li>
            <li>No Financeiro, abra uma conta a receber e use <b>Gerar boleto (Asaas)</b>.</li>
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
    padding: "7px 10px",
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
    <div className="mb-[10px]">
      <div className="text-gp-muted text-[11px] font-extrabold tracking-[0.5px] mb-[6px] pb-1 border-b border-gp-border">
        {titulo.toUpperCase()}
      </div>
      <div className="flex flex-col gap-[6px]">{children}</div>
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
    padding: "7px 10px",
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
