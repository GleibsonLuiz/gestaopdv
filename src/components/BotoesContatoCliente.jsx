import { useState, useRef, useEffect } from "react";
import { C } from "../lib/theme.js";
import { aplicarVariaveis, gerarLink } from "../lib/templates.js";

// Componente reutilizavel de botoes de contato (WhatsApp / Telefone / Email).
// Cada botao mostra dropdown com templates do tipo + opcao "Mensagem em branco".
//
// Props:
//   cliente: objeto com nome, telefone, email, cidade, etc. Pode ter `rfm` ou `kpis`.
//   templates: array de TemplateMensagem (todos os tipos, do backend).
//   tamanho: "sm" (icones compactos) | "md" (padrao, com label).
//   variant: "icones" (so emoji) | "completo" (label + icone).

export default function BotoesContatoCliente({
  cliente,
  templates = [],
  tamanho = "sm",
  variant = "icones",
  kpis = null,
}) {
  const wa = cliente.telefone ? true : false;
  const tel = cliente.telefone ? true : false;
  const mail = cliente.email ? true : false;

  return (
    <div style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
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

// Botao simples (sem templates) — usado para ligar.
function BotaoSimples({ href, icone, label, cor, tamanho, variant }) {
  return (
    <a
      href={href}
      title={label}
      style={estiloBotao(cor, tamanho, variant)}
    >
      <span>{icone}</span>
      {variant === "completo" && <span style={{ marginLeft: 4 }}>{label}</span>}
    </a>
  );
}

// Botao com dropdown de templates — usado para WA e Email.
function BotaoComTemplates({ tipo, cliente, kpis, templates, icone, label, cor, tamanho, variant }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    function onKey(e) { if (e.key === "Escape") setAberto(false); }
    if (aberto) {
      document.addEventListener("mousedown", onClickFora);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onClickFora);
      document.removeEventListener("keydown", onKey);
    };
  }, [aberto]);

  function abrirComTemplate(template) {
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
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setAberto((v) => !v); }}
        title={`${label} (${templates.length} template${templates.length === 1 ? "" : "s"})`}
        style={{ ...estiloBotao(cor, tamanho, variant), cursor: "pointer" }}
      >
        <span>{icone}</span>
        {variant === "completo" && <span style={{ marginLeft: 4 }}>{label}</span>}
        <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>▾</span>
      </button>
      {aberto && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0,
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
            minWidth: 240, zIndex: 500, padding: 4,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          <button
            onClick={() => abrirComTemplate(null)}
            style={itemDropdown(C.muted)}
          >
            <span style={{ fontSize: 14 }}>✨</span>
            <div>
              <div style={{ color: C.text, fontWeight: 600, fontSize: 12 }}>Mensagem em branco</div>
              <div style={{ color: C.muted, fontSize: 10 }}>Abrir sem template</div>
            </div>
          </button>
          <div style={{ borderTop: `1px solid ${C.border}`, margin: "4px 0" }} />
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => abrirComTemplate(t)}
              style={itemDropdown(cor)}
            >
              <span style={{ fontSize: 14 }}>{icone}</span>
              <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                <div style={{ color: C.text, fontWeight: 600, fontSize: 12 }}>{t.nome}</div>
                <div style={{ color: C.muted, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

function estiloBotao(cor, tamanho, variant) {
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

function itemDropdown() {
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
