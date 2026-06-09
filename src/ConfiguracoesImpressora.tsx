import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";
import type { SessionUser } from "./lib/api";
import {
  invalidarCacheImpressora,
  imprimirDocumento,
} from "./lib/impressora";
import type { ConfigImpressora, LarguraImpressao } from "./lib/impressora";
import {
  qzConfig,
  salvarQzConfig,
  listarImpressorasQz,
  imprimirRawQz,
  comandosTesteQz,
} from "./lib/qztray";
import { useConfiguracaoEmpresa } from "./HeaderRelatorio";
import CupomEnvelope from "./components/cupons/CupomEnvelope";
import CupomTeste from "./components/cupons/CupomTeste";

// Tela de configuracao da impressora nao-fiscal. Layout em duas colunas:
//   - Esquerda: formulario (largura, layout, conteudo, comportamento,
//     quais documentos imprimem, cabecalho/rodape extras)
//   - Direita: preview do cupom em tempo real + botao "Imprimir teste"
//
// Permissao: rota PUT exige ADMIN/GERENTE. GET livre porque o cupom do
// PDV/Caixa/Financeiro tambem precisa ler a config.

type FormState = Omit<ConfigImpressora, "cabecalhoExtra" | "rodapeExtra"> & {
  cabecalhoExtra: string;
  rodapeExtra: string;
};

const DEFAULTS: FormState = {
  ativo: true,
  largura: "MM_80",
  fonteBase: 12,
  margemMm: 4,
  cabecalhoExtra: "",
  rodapeExtra: "",
  mostrarLogo: true,
  mostrarCnpj: true,
  mostrarVendedor: true,
  mostrarCliente: true,
  viasVenda: 1,
  cortarLinhasFinal: 4,
  abrirGavetaDinheiro: false,
  imprimirAutomatico: true,
  imprimirVenda: true,
  imprimirOrcamento: true,
  imprimirSangria: true,
  imprimirSuprimento: true,
  imprimirFechamento: true,
  imprimirReciboFin: true,
};

type LarguraOpt = { id: LarguraImpressao; label: string };
const LARGURAS: LarguraOpt[] = [
  { id: "MM_58", label: "58 mm (térmica pequena)" },
  { id: "MM_80", label: "80 mm (térmica padrão)" },
  { id: "A4", label: "A4 (folha comum)" },
];

type DocumentoCampo =
  | "imprimirVenda"
  | "imprimirOrcamento"
  | "imprimirSangria"
  | "imprimirSuprimento"
  | "imprimirFechamento"
  | "imprimirReciboFin";

const DOCUMENTOS: { campo: DocumentoCampo; label: string }[] = [
  { campo: "imprimirVenda", label: "Cupom de venda (PDV)" },
  { campo: "imprimirOrcamento", label: "Orçamento" },
  { campo: "imprimirSangria", label: "Sangria de caixa" },
  { campo: "imprimirSuprimento", label: "Suprimento de caixa" },
  { campo: "imprimirFechamento", label: "Fechamento de caixa" },
  { campo: "imprimirReciboFin", label: "Recibo de pagamento/recebimento" },
];

type Props = {
  user: SessionUser;
};

function normalizar(cfg: Partial<ConfigImpressora> | null | undefined): FormState {
  return {
    ...DEFAULTS,
    ...(cfg || {}),
    cabecalhoExtra: cfg?.cabecalhoExtra || "",
    rodapeExtra: cfg?.rodapeExtra || "",
  };
}

export default function ConfiguracoesImpressora({ user }: Props) {
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const empresa = useConfiguracaoEmpresa();

  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE";

  useEffect(() => {
    let ativo = true;
    api.obterConfiguracaoImpressora()
      .then(cfg => {
        if (!ativo || !cfg) return;
        setForm(normalizar(cfg as Partial<ConfigImpressora>));
      })
      .catch((err: Error) => setErro(err.message))
      .finally(() => setCarregando(false));
    return () => { ativo = false; };
  }, []);

  function flash(t: string) {
    setMensagem(t);
    setTimeout(() => setMensagem(""), 2500);
  }

  function alterar<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm(f => ({ ...f, [campo]: valor }));
  }

  async function salvar(e?: FormEvent) {
    e?.preventDefault?.();
    setErro("");
    setSalvando(true);
    try {
      const payload: ConfigImpressora = {
        ...form,
        cabecalhoExtra: form.cabecalhoExtra?.trim() || null,
        rodapeExtra: form.rodapeExtra?.trim() || null,
        fonteBase: Number(form.fonteBase),
        margemMm: Number(form.margemMm),
        viasVenda: Number(form.viasVenda),
        cortarLinhasFinal: Number(form.cortarLinhasFinal),
      };
      const atualizado = await api.salvarConfiguracaoImpressora(payload) as Partial<ConfigImpressora>;
      setForm(normalizar(atualizado));
      invalidarCacheImpressora();
      flash("Configuração salva.");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function imprimirTeste() {
    setErro("");
    try {
      await imprimirDocumento(
        <CupomEnvelope cfg={form}>
          <CupomTeste empresa={empresa} cfg={form} />
        </CupomEnvelope>,
        { viasVenda: 1 },
      );
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  // Mantemos o preview "vivo" — re-renderiza a cada alteracao do form,
  // sem precisar salvar primeiro.
  const cfgPreview = useMemo<FormState>(() => ({ ...form }), [form]);

  if (carregando) {
    return <div style={{ color: C.muted, padding: 20 }}>Carregando configurações...</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 24, alignItems: "start" }}>
      {/* COLUNA ESQUERDA — FORMULARIO */}
      <form onSubmit={salvar} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        {mensagem && <Alerta tipo="sucesso">{mensagem}</Alerta>}

        <Card titulo="Status">
          <Switch
            label="Impressão ativa"
            descricao="Quando desligado, nenhum cupom é impresso."
            checked={form.ativo}
            onChange={v => alterar("ativo", v)}
            disabled={!podeEditar}
          />
        </Card>

        <Card titulo="Layout do cupom">
          <div style={{ display: "grid", gap: 10 }}>
            <Label>Largura do papel</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {LARGURAS.map(l => (
                <Radio
                  key={l.id}
                  label={l.label}
                  checked={form.largura === l.id}
                  onChange={() => alterar("largura", l.id)}
                  disabled={!podeEditar}
                />
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Numerico
                label="Fonte base (px)"
                min={8} max={24}
                value={form.fonteBase}
                onChange={v => alterar("fonteBase", Number(v))}
                disabled={!podeEditar}
              />
              <Numerico
                label="Margem (mm)"
                min={0} max={20}
                value={form.margemMm}
                onChange={v => alterar("margemMm", Number(v))}
                disabled={!podeEditar}
              />
            </div>
          </div>
        </Card>

        <Card titulo="Conteúdo do cupom">
          <div style={{ display: "grid", gap: 8 }}>
            <Switch label="Logotipo" checked={form.mostrarLogo} onChange={v => alterar("mostrarLogo", v)} disabled={!podeEditar} />
            <Switch label="CNPJ" checked={form.mostrarCnpj} onChange={v => alterar("mostrarCnpj", v)} disabled={!podeEditar} />
            <Switch label="Nome do vendedor" checked={form.mostrarVendedor} onChange={v => alterar("mostrarVendedor", v)} disabled={!podeEditar} />
            <Switch label="Nome do cliente" checked={form.mostrarCliente} onChange={v => alterar("mostrarCliente", v)} disabled={!podeEditar} />
          </div>
          <div style={{ marginTop: 12 }}>
            <Label>Cabeçalho extra <span style={{ color: C.muted, fontWeight: 400 }}>(até 3 linhas)</span></Label>
            <textarea
              value={form.cabecalhoExtra}
              onChange={e => alterar("cabecalhoExtra", e.target.value)}
              disabled={!podeEditar}
              rows={3}
              placeholder="Ex: WhatsApp: (11) 99999-9999"
              style={textareaStyle}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <Label>Rodapé extra <span style={{ color: C.muted, fontWeight: 400 }}>(até 3 linhas)</span></Label>
            <textarea
              value={form.rodapeExtra}
              onChange={e => alterar("rodapeExtra", e.target.value)}
              disabled={!podeEditar}
              rows={3}
              placeholder="Ex: Obrigado pela preferência! Volte sempre."
              style={textareaStyle}
            />
          </div>
        </Card>

        <Card titulo="Comportamento">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Numerico label="Vias por venda" min={1} max={3} value={form.viasVenda} onChange={v => alterar("viasVenda", Number(v))} disabled={!podeEditar} />
            <Numerico label="Linhas em branco no fim" min={0} max={12} value={form.cortarLinhasFinal} onChange={v => alterar("cortarLinhasFinal", Number(v))} disabled={!podeEditar} />
          </div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <Switch
              label="Imprimir automaticamente ao concluir venda"
              descricao="Quando desligado, o operador precisa clicar em 'Imprimir cupom' no recibo."
              checked={form.imprimirAutomatico}
              onChange={v => alterar("imprimirAutomatico", v)}
              disabled={!podeEditar}
            />
            <Switch
              label="Abrir gaveta em vendas em dinheiro"
              descricao="Requer agente ESC/POS instalado (não funciona via impressão do navegador)."
              checked={form.abrirGavetaDinheiro}
              onChange={v => alterar("abrirGavetaDinheiro", v)}
              disabled={!podeEditar}
            />
          </div>
        </Card>

        <Card titulo="Quais documentos imprimem">
          <div style={{ display: "grid", gap: 8 }}>
            {DOCUMENTOS.map(d => (
              <Switch
                key={d.campo}
                label={d.label}
                checked={form[d.campo]}
                onChange={v => alterar(d.campo, v)}
                disabled={!podeEditar}
              />
            ))}
          </div>
        </Card>

        <CardQzTray empresaNome={((empresa?.nomeFantasia || empresa?.razaoSocial) as string) || ""} podeEditar={podeEditar} />

        {podeEditar && (
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={imprimirTeste}
              style={{
                background: C.surface, border: `1px solid ${C.border}`, color: C.text,
                padding: "10px 16px", borderRadius: 8, cursor: "pointer",
                fontSize: 13, fontWeight: 600,
              }}
            >
              🖨️ Imprimir cupom de teste
            </button>
            <button
              type="submit"
              disabled={salvando}
              style={{
                background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                border: "none", color: "var(--accent-ink)",
                padding: "10px 18px", borderRadius: 8, cursor: salvando ? "wait" : "pointer",
                fontSize: 13, fontWeight: 700, opacity: salvando ? 0.7 : 1,
              }}
            >
              {salvando ? "Salvando..." : "Salvar configuração"}
            </button>
          </div>
        )}
      </form>

      {/* COLUNA DIREITA — PREVIEW */}
      <div style={{
        position: "sticky", top: 16,
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: 14,
      }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 }}>
          Preview
        </div>
        <div style={{
          display: "flex", justifyContent: "center",
          padding: 12, background: "#33384f", borderRadius: 8,
          maxHeight: 600, overflowY: "auto",
        }}>
          <CupomEnvelope cfg={cfgPreview} preview>
            <CupomTeste empresa={empresa} cfg={cfgPreview} />
          </CupomEnvelope>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.4 }}>
          O preview reflete largura, fonte, conteúdo e rodapé. Use "Imprimir cupom de teste" para enviar à impressora real.
        </div>
      </div>
    </div>
  );
}

// ===== Helpers de UI =====

function Card({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <section style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: 16,
    }}>
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12 }}>
        {titulo}
      </div>
      {children}
    </section>
  );
}

function Alerta({ tipo, children }: { tipo: "erro" | "sucesso"; children?: ReactNode }) {
  const cor = tipo === "erro" ? C.red : C.green;
  return (
    <div style={{
      background: `${cor}1a`, border: `1px solid ${cor}55`, color: cor,
      padding: "10px 14px", borderRadius: 8, fontSize: 13,
    }}>{children}</div>
  );
}

function Label({ children }: { children?: ReactNode }) {
  return (
    <label style={{ fontSize: 12, color: C.text, fontWeight: 600, marginBottom: 4, display: "block" }}>
      {children}
    </label>
  );
}

type SwitchProps = {
  label: string;
  descricao?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
};

function Switch({ label, descricao, checked, onChange, disabled }: SwitchProps) {
  return (
    <label style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.6 : 1,
    }}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={e => onChange?.(e.target.checked)}
        disabled={disabled}
        style={{ marginTop: 3, accentColor: C.accent, width: 16, height: 16 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{label}</div>
        {descricao && <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2, lineHeight: 1.4 }}>{descricao}</div>}
      </div>
    </label>
  );
}

type RadioProps = {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
};

function Radio({ label, checked, onChange, disabled }: RadioProps) {
  return (
    <label style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.6 : 1,
      background: checked ? `${C.accent}22` : C.bg,
      border: `1px solid ${checked ? C.accent : C.border}`,
      borderRadius: 8, padding: "8px 12px", fontSize: 12.5,
    }}>
      <input type="radio" checked={!!checked} onChange={onChange} disabled={disabled} style={{ accentColor: C.accent }} />
      <span style={{ color: C.text }}>{label}</span>
    </label>
  );
}

type NumericoProps = {
  label: string;
  value: number | string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
};

function Numerico({ label, value, onChange, min, max, disabled }: NumericoProps) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={e => onChange?.(e.target.value)}
        disabled={disabled}
        style={inputStyle}
      />
    </div>
  );
}

const inputStyle: CSSProperties = {
  background: C.bg, border: `1px solid ${C.border}`, color: C.text,
  padding: "8px 12px", borderRadius: 8, fontSize: 13, width: "100%",
  outline: "none",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: "'Segoe UI', sans-serif",
  resize: "vertical",
  minHeight: 64,
};

// ===== Card: impressão direta via agente QZ Tray =====
// Config por máquina (localStorage). Permite imprimir o cupom direto numa
// impressora escolhida pelo nome, sem depender da padrão do Windows e sem
// caixa de diálogo. Tudo OFF por padrão — só liga quem instalar o agente.
type CardQzProps = { empresaNome?: string | null; podeEditar: boolean };

function CardQzTray({ empresaNome, podeEditar }: CardQzProps) {
  const inicial = qzConfig();
  const [ativo, setAtivo] = useState(inicial.ativo);
  const [impressora, setImpressora] = useState(inicial.impressora);
  const [impressoras, setImpressoras] = useState<string[]>(
    inicial.impressora ? [inicial.impressora] : [],
  );
  const [status, setStatus] = useState<"idle" | "buscando" | "ok" | "ausente">("idle");
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  function flash(t: string) {
    setMsg(t);
    setTimeout(() => setMsg(""), 2500);
  }

  async function detectar() {
    setErro("");
    setStatus("buscando");
    try {
      const lista = await listarImpressorasQz();
      setImpressoras(lista);
      setStatus("ok");
      if (!impressora && lista.length) {
        // Pré-seleciona uma POS80/térmica se houver, senão a primeira.
        const palpite = lista.find(n => /pos|80|term|thermal|cupom/i.test(n)) || lista[0];
        setImpressora(palpite);
        salvarQzConfig({ impressora: palpite });
      }
    } catch (err) {
      setStatus("ausente");
      setErro((err as Error).message || "Agente não encontrado.");
    }
  }

  function alterarAtivo(v: boolean) {
    setAtivo(v);
    salvarQzConfig({ ativo: v });
  }
  function alterarImpressora(v: string) {
    setImpressora(v);
    salvarQzConfig({ impressora: v });
  }

  async function imprimirTeste() {
    setErro("");
    try {
      await imprimirRawQz(comandosTesteQz(empresaNome || "ESTABELECIMENTO"), impressora || undefined);
      flash("Teste enviado ao agente.");
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const badge =
    status === "ok" ? { txt: "Agente conectado", cor: C.green } :
    status === "buscando" ? { txt: "Procurando…", cor: C.muted } :
    status === "ausente" ? { txt: "Agente não encontrado", cor: C.red } :
    { txt: "Não verificado", cor: C.muted };

  return (
    <Card titulo="Impressão direta via agente (QZ Tray)">
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>
        Imprime o cupom direto numa impressora escolhida pelo nome — <b>sem caixa de diálogo</b> e
        sem depender da impressora padrão do Windows (ideal quando o mesmo PC usa outras impressoras).
        Requer o app gratuito <b>QZ Tray</b> instalado e aberto neste computador
        (<a href="https://qz.io/download" target="_blank" rel="noreferrer noopener" style={{ color: C.accent }}>qz.io/download</a>).
        Esta configuração é só deste PC.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: badge.cor,
          background: `${badge.cor}1a`, border: `1px solid ${badge.cor}55`,
          padding: "3px 10px", borderRadius: 999,
        }}>● {badge.txt}</span>
        <button
          type="button"
          onClick={detectar}
          disabled={status === "buscando"}
          style={{
            background: C.bg, border: `1px solid ${C.border}`, color: C.text,
            padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
          }}
        >
          {status === "buscando" ? "Procurando…" : "Detectar agente / listar impressoras"}
        </button>
      </div>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {msg && <Alerta tipo="sucesso">{msg}</Alerta>}

      {impressoras.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <Label>Impressora deste PC</Label>
          <select
            value={impressora}
            onChange={e => alterarImpressora(e.target.value)}
            disabled={!podeEditar}
            title="Impressora deste PC"
            aria-label="Impressora deste PC"
            style={inputStyle}
          >
            <option value="">— selecione —</option>
            {impressoras.map(nome => (
              <option key={nome} value={nome}>{nome}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <Switch
          label="Usar o agente para imprimir o cupom da venda"
          descricao="Quando ligado, o cupom sai direto na impressora escolhida acima. Se o agente falhar, cai automaticamente na impressão do navegador."
          checked={ativo}
          onChange={alterarAtivo}
          disabled={!podeEditar || !impressora}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={imprimirTeste}
          disabled={!impressora}
          style={{
            background: C.surface, border: `1px solid ${C.border}`,
            color: impressora ? C.text : C.muted,
            padding: "8px 14px", borderRadius: 8, cursor: impressora ? "pointer" : "not-allowed",
            fontSize: 13, fontWeight: 600,
          }}
        >
          🖨️ Imprimir teste via agente
        </button>
      </div>
    </Card>
  );
}
