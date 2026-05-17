import { useState, useRef, useEffect, type CSSProperties } from "react";
import { C } from "../lib/theme";
import { aplicarVariaveis, gerarLink, type ClienteParaTemplate, type ClienteKpis, type TipoMensagem } from "../lib/templates";

// Componente reutilizavel de botoes de contato (WhatsApp / Telefone / Email).
// Cada botao mostra dropdown com templates do tipo + opcao "Mensagem em branco".

type Tamanho = "sm" | "md";
type Variant = "icones" | "completo";

interface Template {
  id: string;
  nome: string;
  corpo: string;
  assunto?: string;
  tipo: TipoMensagem;
  ativo: boolean;
}

interface BotoesContatoClienteProps {
  cliente: ClienteParaTemplate;
  templates?: Template[];
  tamanho?: Tamanho;
  variant?: Variant;
  kpis?: ClienteKpis | null;
}

export default function BotoesContatoCliente({
  cliente,
  templates = [],
  tamanho = "sm",
  variant = "icones",
  kpis = null,
}: BotoesContatoClienteProps) {
  const wa = !!cliente.telefone;
  const tel = !!cliente.telefone;
  const mail = !!cliente.email;

  return (
    <div className="inline-flex gap-1 items-center">
      {wa && (
        <BotaoComTemplates
          tipo="WHATSAPP"
          cliente={cliente}
          kpis={kpis}
          templates={templates.filter((t) => t.tipo === "WHATSAPP" && t.ativo)}
          icone="💬"
          label="WhatsApp"
          cor={C.green}
          tamanho={tamanho}
          variant={variant}
        />
      )}
      {tel && (
        <BotaoSimples
          href={`tel:${String(cliente.telefone).replace(/\D/g, "")}`}
          icone="📞"
          label="Ligar"
          cor={C.accent}
          tamanho={tamanho}
          variant={variant}
        />
      )}
      {mail && (
        <BotaoComTemplates
          tipo="EMAIL"
          cliente={cliente}
          kpis={kpis}
          templates={templates.filter((t) => t.tipo === "EMAIL" && t.ativo)}
          icone="✉️"
          label="Email"
          cor={C.purple || "#7c3aed"}
          tamanho={tamanho}
          variant={variant}
        />
      )}
    </div>
  );
}

interface BotaoSimplesProps {
  href: string;
  icone: string;
  label: string;
  cor: string;
  tamanho: Tamanho;
  variant: Variant;
}

// Botao simples (sem templates) — usado para ligar.
function BotaoSimples({ href, icone, label, cor, tamanho, variant }: BotaoSimplesProps) {
  return (
    <a href={href} title={label} style={estiloBotao(cor, tamanho, variant)}>
      <span>{icone}</span>
      {variant === "completo" && <span className="ml-1">{label}</span>}
    </a>
  );
}

interface BotaoComTemplatesProps {
  tipo: TipoMensagem;
  cliente: ClienteParaTemplate;
  kpis: ClienteKpis | null;
  templates: Template[];
  icone: string;
  label: string;
  cor: string;
  tamanho: Tamanho;
  variant: Variant;
}

// Botao com dropdown de templates — usado para WA e Email.
function BotaoComTemplates({ tipo, cliente, kpis, templates, icone, label, cor, tamanho, variant }: BotaoComTemplatesProps) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setAberto(false); }
    if (aberto) {
      document.addEventListener("mousedown", onClickFora);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onClickFora);
      document.removeEventListener("keydown", onKey);
    };
  }, [aberto]);

  function abrirComTemplate(template: Template | null) {
    const corpo = template ? aplicarVariaveis(template.corpo, cliente, kpis) : "";
    const assunto = template?.assunto ? aplicarVariaveis(template.assunto, cliente, kpis) : "";
    const link = gerarLink({
      tipo, corpo, assunto,
      telefone: cliente.telefone,
      email: cliente.email,
    });
    if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
    }
    setAberto(false);
  }

  // Sem templates: comporta como link direto.
  if (templates.length === 0) {
    return (
      <BotaoSimples
        href={gerarLink({ tipo, telefone: cliente.telefone, email: cliente.email }) || "#"}
        icone={icone}
        label={label}
        cor={cor}
        tamanho={tamanho}
        variant={variant}
      />
    );
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); setAberto((v) => !v); }}
        title={`${label} (${templates.length} template${templates.length === 1 ? "" : "s"})`}
        style={{ ...estiloBotao(cor, tamanho, variant), cursor: "pointer" }}
      >
        <span>{icone}</span>
        {variant === "completo" && <span className="ml-1">{label}</span>}
        <span className="ml-1 text-[9px] opacity-70">▾</span>
      </button>
      {aberto && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 bg-gp-surface rounded-lg p-1"
          style={{
            top: "calc(100% + 4px)",
            border: `1px solid ${C.border}`,
            minWidth: 240,
            zIndex: 500,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          <button onClick={() => abrirComTemplate(null)} style={itemDropdown()}>
            <span className="text-sm">✨</span>
            <div>
              <div className="text-gp-text font-semibold text-xs">Mensagem em branco</div>
              <div className="text-gp-muted text-[10px]">Abrir sem template</div>
            </div>
          </button>
          <div style={{ borderTop: `1px solid ${C.border}`, margin: "4px 0" }} />
          {templates.map((t) => (
            <button key={t.id} onClick={() => abrirComTemplate(t)} style={itemDropdown()}>
              <span className="text-sm">{icone}</span>
              <div className="min-w-0 flex-1 text-left">
                <div className="text-gp-text font-semibold text-xs">{t.nome}</div>
                <div className="text-gp-muted text-[10px] overflow-hidden text-ellipsis whitespace-nowrap">
                  {t.corpo.slice(0, 60)}{t.corpo.length > 60 ? "…" : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function estiloBotao(cor: string, tamanho: Tamanho, variant: Variant): CSSProperties {
  const compact = tamanho === "sm";
  return {
    background: cor + "22",
    color: cor,
    border: `1px solid ${cor}44`,
    borderRadius: 4,
    padding: compact ? "4px 8px" : "6px 12px",
    textDecoration: "none",
    fontSize: compact ? 13 : 14,
    display: "inline-flex",
    alignItems: "center",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: variant === "completo" ? 600 : 400,
    lineHeight: 1,
  };
}

function itemDropdown(): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    width: "100%",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    borderRadius: 4,
    color: C.text,
  };
}
