import { useEffect, useState, useMemo, type CSSProperties, type ReactNode } from "react";
import { C } from "../lib/theme";
import { api } from "../lib/api";
import { VARIAVEIS_DISPONIVEIS, aplicarVariaveis, type TipoMensagem, type ClienteParaTemplate } from "../lib/templates";

interface TipoCfg {
  id: TipoMensagem;
  label: string;
  icone: string;
  cor: string;
}

const TIPOS: TipoCfg[] = [
  { id: "WHATSAPP", label: "WhatsApp", icone: "💬", cor: "#22c55e" },
  { id: "EMAIL",    label: "Email",    icone: "✉️", cor: "#7c3aed" },
  { id: "SMS",      label: "SMS",      icone: "📱", cor: "#4f8ef7" },
];

const CLIENTE_PREVIEW: ClienteParaTemplate = {
  nome: "MARIA SILVA SANTOS",
  telefone: "(11) 99999-9999",
  email: "maria@exemplo.com.br",
  cidade: "SAO PAULO",
  estado: "SP",
  rfm: { ultimaCompra: "2026-04-10", monetario: 1850.50, recenciaDias: 34 },
  kpis: { valorInadimplente: 0 },
};

export interface Template {
  id?: string;
  nome: string;
  tipo: TipoMensagem;
  assunto?: string | null;
  corpo: string;
  ativo: boolean;
  ordem?: number;
}

interface ModalGerirTemplatesProps {
  onFechar: () => void;
  podeEditar?: boolean;
  podeExcluir?: boolean;
}

export default function ModalGerirTemplates({ onFechar, podeEditar, podeExcluir }: ModalGerirTemplatesProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<Template | null>(null);
  const [erro, setErro] = useState("");

  async function carregar() {
    setCarregando(true);
    try {
      const r = await api.listarTemplates() as Template[];
      setTemplates(r);
    } catch (e) {
      setErro((e as Error).message || "Erro ao carregar templates");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !editando) onFechar(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFechar, editando]);

  async function excluir(t: Template) {
    if (!confirm(`Excluir template "${t.nome}"?`)) return;
    try {
      if (t.id) await api.excluirTemplate(t.id);
      await carregar();
    } catch (e) {
      alert((e as Error).message || "Erro ao excluir");
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !editando) onFechar(); }}
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", zIndex: 1000 }}
    >
      <div
        className="bg-gp-surface rounded-xl w-full max-w-[760px] max-h-[90vh] overflow-y-auto"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div
          className="px-5 py-4 flex justify-between items-center"
          style={{ borderBottom: `1px solid ${C.border}` }}
        >
          <div>
            <div className="text-gp-white text-base font-bold">📨 Templates de Mensagem</div>
            <div className="text-gp-muted text-xs mt-[2px]">
              Modelos prontos para WhatsApp, Email e SMS com variáveis automáticas
            </div>
          </div>
          <button
            onClick={onFechar}
            className="bg-transparent text-gp-muted border-none text-[22px] cursor-pointer p-1"
          >
            ×
          </button>
        </div>

        {editando ? (
          <EditorTemplate
            template={editando}
            onCancelar={() => setEditando(null)}
            onSalvo={async () => { setEditando(null); await carregar(); }}
          />
        ) : (
          <>
            <div className="p-5">
              {erro && (
                <div
                  className="px-3 py-2 rounded text-xs mb-3 text-gp-red"
                  style={{ background: C.red + "22" }}
                >
                  {erro}
                </div>
              )}

              {podeEditar && (
                <button
                  onClick={() => setEditando({ nome: "", tipo: "WHATSAPP", assunto: "", corpo: "", ativo: true, ordem: 0 })}
                  className="text-gp-white border-none px-[18px] py-2 rounded cursor-pointer text-[13px] font-bold mb-4"
                  style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.purple})` }}
                >
                  + Novo template
                </button>
              )}

              {carregando ? (
                <div className="text-gp-muted p-5 text-center">Carregando...</div>
              ) : templates.length === 0 ? (
                <div className="text-gp-muted px-[30px] py-[30px] text-center text-[13px]">
                  Nenhum template cadastrado. Crie o primeiro para usar mensagens rápidas no WhatsApp e Email.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {templates.map((t) => {
                    const tipo = TIPOS.find((x) => x.id === t.tipo) || TIPOS[0];
                    return (
                      <div
                        key={t.id}
                        className="bg-gp-bg rounded px-[14px] py-[10px] flex items-center gap-3"
                        style={{
                          border: `1px solid ${C.border}`,
                          borderLeft: `3px solid ${tipo.cor}`,
                          opacity: t.ativo ? 1 : 0.5,
                        }}
                      >
                        <span
                          className="px-2 py-[3px] rounded text-[11px] font-bold inline-flex items-center gap-1"
                          style={{ background: tipo.cor + "22", color: tipo.cor }}
                        >
                          {tipo.icone} {tipo.label}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-gp-white font-semibold text-[13px]">
                            {t.nome} {!t.ativo && <span className="text-gp-muted text-[10px]">(inativo)</span>}
                          </div>
                          <div className="text-gp-muted text-[11px] overflow-hidden text-ellipsis whitespace-nowrap">
                            {t.corpo}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {podeEditar && (
                            <button onClick={() => setEditando(t)} style={btnAcao(C.accent)}>
                              Editar
                            </button>
                          )}
                          {podeExcluir && (
                            <button onClick={() => excluir(t)} style={btnAcao(C.red)}>
                              🗑
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div
              className="px-5 py-3 flex justify-end"
              style={{ borderTop: `1px solid ${C.border}` }}
            >
              <button
                onClick={onFechar}
                className="bg-gp-accent text-gp-white border-none px-[22px] py-2 rounded cursor-pointer text-[13px] font-bold"
              >
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============ EDITOR DE TEMPLATE ============

interface EditorTemplateProps {
  template: Template;
  onCancelar: () => void;
  onSalvo: () => Promise<void> | void;
}

function EditorTemplate({ template, onCancelar, onSalvo }: EditorTemplateProps) {
  const ehNovo = !template.id;
  const [form, setForm] = useState<Template>(template);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  function set<K extends keyof Template>(k: K, v: Template[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function inserirVariavel(chave: string) {
    const placeholder = `{{${chave}}}`;
    setForm((f) => ({ ...f, corpo: (f.corpo || "") + placeholder }));
  }

  const preview = useMemo(() => {
    return {
      assunto: aplicarVariaveis(form.assunto || "", CLIENTE_PREVIEW),
      corpo: aplicarVariaveis(form.corpo || "", CLIENTE_PREVIEW),
    };
  }, [form.assunto, form.corpo]);

  async function salvar() {
    setErro("");
    if (!form.nome.trim()) return setErro("Nome é obrigatório");
    if (!form.corpo.trim()) return setErro("Corpo é obrigatório");
    if (form.tipo === "EMAIL" && !(form.assunto || "").trim()) return setErro("Assunto é obrigatório para Email");

    setSalvando(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        tipo: form.tipo,
        assunto: form.assunto || null,
        corpo: form.corpo.trim(),
        ativo: form.ativo,
        ordem: form.ordem || 0,
      };
      if (ehNovo) await api.criarTemplate(payload);
      else if (form.id) await api.atualizarTemplate(form.id, payload);
      await onSalvo();
    } catch (e) {
      setErro((e as Error).message || "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  const tipoCfg = TIPOS.find((t) => t.id === form.tipo) || TIPOS[0];

  return (
    <div className="p-5">
      <div className="text-gp-muted text-[11px] uppercase tracking-[0.5px] mb-[10px] font-semibold">
        {ehNovo ? "Novo template" : `Editando: ${template.nome}`}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Campo label="Nome *">
          <input
            value={form.nome}
            onChange={(e) => set("nome", e.target.value)}
            placeholder="Ex: Cobranca amigavel"
            style={inputModal()}
            autoFocus
          />
        </Campo>
        <Campo label="Canal *">
          <select
            value={form.tipo}
            onChange={(e) => set("tipo", e.target.value as TipoMensagem)}
            style={inputModal()}
          >
            {TIPOS.map((t) => (
              <option key={t.id} value={t.id}>{t.icone} {t.label}</option>
            ))}
          </select>
        </Campo>
      </div>

      {form.tipo === "EMAIL" && (
        <Campo label="Assunto *">
          <input
            value={form.assunto || ""}
            onChange={(e) => set("assunto", e.target.value)}
            placeholder="Ex: Olá {{primeiroNome}}, sentimos sua falta!"
            style={inputModal()}
          />
        </Campo>
      )}

      <Campo label="Corpo da mensagem *">
        <textarea
          value={form.corpo}
          onChange={(e) => set("corpo", e.target.value)}
          rows={6}
          placeholder={`Olá {{primeiroNome}}, tudo bem?\nNotamos que sua última compra foi em {{ultimaCompra}}. Que tal aproveitar nossa promoção?`}
          style={{ ...inputModal(), resize: "vertical", minHeight: 120, fontFamily: "monospace", fontSize: 12 }}
        />
      </Campo>

      <div className="mb-[14px]">
        <div className="text-gp-muted text-[10px] uppercase tracking-[0.5px] mb-[6px]">
          Variáveis disponíveis (clique para inserir)
        </div>
        <div className="flex flex-wrap gap-1">
          {VARIAVEIS_DISPONIVEIS.map((v) => (
            <button
              key={v.chave}
              type="button"
              onClick={() => inserirVariavel(v.chave)}
              title={v.desc}
              className="bg-gp-bg text-gp-accent px-2 py-[3px] rounded cursor-pointer text-[10px] font-mono"
              style={{ border: `1px solid ${C.border}` }}
            >
              {`{{${v.chave}}}`}
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="mb-[14px]">
        <div className="text-gp-muted text-[10px] uppercase tracking-[0.5px] mb-[6px]">
          Preview (com cliente exemplo)
        </div>
        <div
          className="bg-gp-bg rounded p-3"
          style={{ border: `1px dashed ${tipoCfg.cor}66` }}
        >
          {form.tipo === "EMAIL" && preview.assunto && (
            <div className="text-gp-white font-bold text-[13px] mb-[6px]">{preview.assunto}</div>
          )}
          <div className="text-gp-text text-xs whitespace-pre-wrap font-mono">
            {preview.corpo || <em className="text-gp-muted">(vazio)</em>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-[14px]">
        <label className="flex items-center gap-[6px] text-gp-text text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={form.ativo}
            onChange={(e) => set("ativo", e.target.checked)}
            style={{ accentColor: C.accent }}
          />
          Template ativo
        </label>
        <Campo label="Ordem">
          <input
            type="number"
            value={form.ordem || 0}
            onChange={(e) => set("ordem", parseInt(e.target.value, 10) || 0)}
            style={{ ...inputModal(), width: 80 }}
          />
        </Campo>
      </div>

      {erro && (
        <div
          className="px-3 py-2 rounded text-xs mb-[10px] text-gp-red"
          style={{ background: C.red + "22" }}
        >
          {erro}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancelar}
          disabled={salvando}
          className="bg-transparent text-gp-muted px-4 py-2 rounded cursor-pointer text-[13px]"
          style={{ border: `1px solid ${C.border}` }}
        >
          Cancelar
        </button>
        <button
          onClick={salvar}
          disabled={salvando}
          className="text-gp-white border-none px-[22px] py-2 rounded cursor-pointer text-[13px] font-bold"
          style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.purple})` }}
        >
          {salvando ? "Salvando..." : (ehNovo ? "Criar" : "Salvar")}
        </button>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-gp-muted text-[10px] uppercase tracking-[0.5px] mb-1 font-semibold">
        {label}
      </div>
      {children}
    </div>
  );
}

function inputModal(): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    background: C.bg,
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
  };
}

function btnAcao(cor: string): CSSProperties {
  return {
    background: "transparent",
    color: cor,
    border: `1px solid ${cor}44`,
    padding: "4px 10px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 11,
  };
}
