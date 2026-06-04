import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import manualMd from "../docs/MANUAL.md?raw";
import { C } from "./lib/theme";

// Mapeia a tela atual do app para o topico/ancora correspondente no MANUAL.md.
// Quando o usuario clica em "?" no header, abrimos Ajuda ja posicionada
// na secao relevante.
export const TELA_AJUDA: Record<string, string> = {
  pdv: "pdv-ponto-de-venda",
  caixa: "caixa",
  dashboard: "dashboard",
  dashboardcrm: "dashboard-crm",
  clientes: "clientes",
  segmentos: "segmentos-rfm-lead-scoring",
  reativacao: "aniversarios-reativacao",
  fornecedores: "fornecedores",
  produtos: "produtos",
  etiquetas: "etiquetas",
  estoque: "estoque",
  inventario: "inventario",
  compras: "compras",
  orcamentos: "orcamentos",
  funil: "funil-de-vendas",
  automacoes: "automacoes",
  nps: "nps-pos-venda",
  tarefas: "tarefas",
  fidelidade: "fidelidade",
  comissoes: "comissoes",
  painelcomandas: "central-de-comandas",
  whatsapp: "whatsapp",
  financeiro: "financeiro",
  despesas: "despesas",
  contabilidade: "contabilidade",
  relatorios: "relatorios",
  empresa: "empresa",
  impressora: "configuracoes-de-impressora",
  funcionarios: "funcionarios-admin-only",
  logs: "logs-de-auditoria-admin-only",
  backup: "backup-admin-only",
  sistema: "sistema-admin-only",
  aparencia: "aparencia",
};

// Sumario dos topicos visiveis na coluna esquerda. Cada item aponta
// para o slug do heading no MANUAL.md (gerado por react-markdown a partir
// do texto do <h3>). Mantemos manual para garantir ordem e agrupamento.
type Topico = { id: string; label: string; icone: string };
type Grupo = { titulo: string; topicos: Topico[] };

const GRUPOS: Grupo[] = [
  {
    titulo: "Inicio",
    topicos: [
      { id: "1-visão-geral",                       icone: "📖", label: "Visao geral" },
      { id: "2-como-entrar-no-sistema",             icone: "🔑", label: "Como entrar" },
      { id: "3-perfis-de-acesso-papéis",            icone: "👥", label: "Perfis de acesso" },
      { id: "4-estrutura-da-tela",                  icone: "🖥️", label: "Estrutura da tela" },
    ],
  },
  {
    titulo: "Operacao",
    topicos: [
      { id: "pdv-ponto-de-venda",        icone: "🛒", label: "PDV" },
      { id: "central-de-comandas",       icone: "🍽️", label: "Central de Comandas" },
      { id: "pdv-volante-mobile",        icone: "📲", label: "PDV Volante" },
      { id: "caixa",                     icone: "💵", label: "Caixa" },
    ],
  },
  {
    titulo: "Cadastros",
    topicos: [
      { id: "clientes",                            icone: "👥", label: "Clientes" },
      { id: "segmentos-rfm-lead-scoring",          icone: "📊", label: "Segmentos" },
      { id: "aniversarios-reativacao",             icone: "🎂", label: "Aniversarios" },
      { id: "fornecedores",                        icone: "🏭", label: "Fornecedores" },
      { id: "produtos",                            icone: "📦", label: "Produtos" },
      { id: "etiquetas",                           icone: "🏷️", label: "Etiquetas" },
    ],
  },
  {
    titulo: "Estoque",
    topicos: [
      { id: "estoque",          icone: "🗃️", label: "Estoque" },
      { id: "inventario",       icone: "📋", label: "Inventario" },
    ],
  },
  {
    titulo: "Vendas & CRM",
    topicos: [
      { id: "compras",            icone: "🛍️", label: "Compras" },
      { id: "orcamentos",         icone: "📝", label: "Orcamentos" },
      { id: "funil-de-vendas",    icone: "🎯", label: "Funil de Vendas" },
      { id: "automacoes",         icone: "⚡", label: "Automacoes" },
      { id: "nps-pos-venda",      icone: "⭐", label: "NPS pos-venda" },
      { id: "dashboard-crm",      icone: "🎯", label: "Dashboard CRM" },
      { id: "tarefas",            icone: "✅", label: "Tarefas" },
      { id: "fidelidade",         icone: "🏆", label: "Fidelidade" },
      { id: "comissoes",          icone: "🏆", label: "Comissoes" },
    ],
  },
  {
    titulo: "Financeiro",
    topicos: [
      { id: "financeiro", icone: "💰", label: "Financeiro" },
      { id: "despesas", icone: "🧾", label: "Despesas" },
      { id: "contabilidade", icone: "📚", label: "Contabilidade" },
    ],
  },
  {
    titulo: "Atendimento",
    topicos: [
      { id: "whatsapp", icone: "💬", label: "WhatsApp" },
    ],
  },
  {
    titulo: "Sistema",
    topicos: [
      { id: "dashboard",                                icone: "📊", label: "Dashboard" },
      { id: "relatorios",                               icone: "📑", label: "Relatorios" },
      { id: "alertas",                                  icone: "🔔", label: "Alertas" },
      { id: "empresa",                                  icone: "🏢", label: "Empresa" },
      { id: "configuracoes-de-impressora",              icone: "🖨️", label: "Impressora" },
      { id: "funcionarios-admin-only",                  icone: "🧑‍💼", label: "Funcionarios" },
      { id: "maquininha-mp-mercado-pago",               icone: "📲", label: "Maquininha MP" },
      { id: "logs-de-auditoria-admin-only",             icone: "📜", label: "Logs" },
      { id: "backup-admin-only",                        icone: "💾", label: "Backup" },
      { id: "sistema-admin-only",                       icone: "🛡", label: "Sistema" },
      { id: "aparencia",                                icone: "🎨", label: "Aparencia" },
    ],
  },
  {
    titulo: "Referencias",
    topicos: [
      { id: "6-resiliência-a-falhas-de-rede",          icone: "🌐", label: "Resiliencia de rede" },
      { id: "7-atalhos-de-teclado",                     icone: "⌨️", label: "Atalhos" },
      { id: "8-termos-do-sistema-glossário",            icone: "📚", label: "Glossario" },
      { id: "9-operações-no-celular",                   icone: "📱", label: "Celular (PWA)" },
      { id: "10-planos-e-limites",                      icone: "💎", label: "Planos e limites" },
      { id: "11-perguntas-frequentes",                  icone: "❓", label: "FAQ" },
      { id: "anexo-a--fluxos-completos-passo-a-passo",  icone: "🧭", label: "Fluxos passo-a-passo" },
      { id: "anexo-b--convenções-visuais",              icone: "🎨", label: "Convencoes visuais" },
    ],
  },
];

// Slugify usado pelo react-markdown. Preserva acentos/cedilha (PT-BR)
// usando classes Unicode \p{L} e \p{N}, para casar com os hrefs do
// proprio MANUAL.md (ex: "[Operacao](#51-operação)").
function slugify(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

interface Props {
  topicoInicial?: string | null;
  onFechar?: () => void;
}

export default function Ajuda({ topicoInicial }: Props) {
  const [busca, setBusca] = useState("");
  const [ativo, setAtivo] = useState<string>(() => topicoInicial || GRUPOS[0].topicos[0].id);
  const [mostrarTopo, setMostrarTopo] = useState(false);
  const conteudoRef = useRef<HTMLDivElement | null>(null);

  // Quando o topicoInicial muda (usuario clica em "?" de outra tela), rola
  // o conteudo ate o heading correspondente.
  useEffect(() => {
    if (!topicoInicial) return;
    setAtivo(topicoInicial);
    // Atraso curto pra dar tempo do react-markdown montar os headings.
    setTimeout(() => rolarPara(topicoInicial), 50);
  }, [topicoInicial]);

  // Mostra/oculta o botao flutuante "voltar ao topo" baseado no scroll
  // do painel de conteudo (nao do window — o painel rola sozinho).
  useEffect(() => {
    const root = conteudoRef.current;
    if (!root) return;
    function aoRolar() {
      setMostrarTopo((root as HTMLDivElement).scrollTop > 400);
    }
    root.addEventListener("scroll", aoRolar, { passive: true });
    return () => root.removeEventListener("scroll", aoRolar);
  }, []);

  function rolarPara(id: string) {
    const root = conteudoRef.current;
    if (!root) return;
    const alvo = root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (alvo) {
      alvo.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function voltarAoTopo() {
    const root = conteudoRef.current;
    if (!root) return;
    root.scrollTo({ top: 0, behavior: "smooth" });
    setAtivo(GRUPOS[0].topicos[0].id);
  }

  function aoClicarTopico(id: string) {
    setAtivo(id);
    rolarPara(id);
  }

  const gruposFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return GRUPOS;
    return GRUPOS.map(g => ({
      ...g,
      topicos: g.topicos.filter(t => t.label.toLowerCase().includes(termo)),
    })).filter(g => g.topicos.length > 0);
  }, [busca]);

  return (
    <div style={estilos.shell}>
      {/* Coluna esquerda: sumario + busca */}
      <aside style={estilos.sumario}>
        <button
          onClick={voltarAoTopo}
          title="Voltar ao inicio do manual"
          style={estilos.cabecalhoSumario}
        >
          <div style={estilos.tituloAjuda}>
            <span style={{ fontSize: 22 }}>❓</span>
            <span>Ajuda</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: C.muted, fontWeight: 500 }}>↑ Inicio</span>
          </div>
          <div style={estilos.subtituloAjuda}>Manual do sistema · clique para voltar ao topo</div>
        </button>
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="🔎 Buscar topico..."
            style={estilos.busca}
          />
        </div>
        <nav style={estilos.navSumario}>
          {gruposFiltrados.map((grupo) => (
            <div key={grupo.titulo} style={{ marginBottom: 8 }}>
              <div style={estilos.tituloGrupo}>{grupo.titulo}</div>
              {grupo.topicos.map((t) => {
                const isAtivo = ativo === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => aoClicarTopico(t.id)}
                    style={{
                      ...estilos.itemTopico,
                      background: isAtivo ? C.accent + "22" : "transparent",
                      color: isAtivo ? C.white : C.text,
                      borderLeft: isAtivo ? `3px solid ${C.accent}` : "3px solid transparent",
                      fontWeight: isAtivo ? 700 : 500,
                    }}
                  >
                    <span style={{ fontSize: 14, width: 22, textAlign: "center" }}>{t.icone}</span>
                    <span style={{ flex: 1, textAlign: "left" }}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {gruposFiltrados.length === 0 && (
            <div style={{ color: C.muted, fontSize: 12, padding: "16px 12px", textAlign: "center" }}>
              Nenhum topico para "{busca}"
            </div>
          )}
        </nav>
      </aside>

      {/* Coluna direita: conteudo markdown */}
      <div ref={conteudoRef} style={estilos.conteudo}>
        <div style={estilos.conteudoInterno}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: (props) => <h1 id={slugify(asText(props.children))} style={estilos.h1} {...props} />,
              h2: (props) => <h2 id={slugify(asText(props.children))} style={estilos.h2} {...props} />,
              h3: (props) => <h3 id={slugify(asText(props.children))} style={estilos.h3} {...props} />,
              h4: (props) => <h4 id={slugify(asText(props.children))} style={estilos.h4} {...props} />,
              p:  (props) => <p style={estilos.p} {...props} />,
              ul: (props) => <ul style={estilos.ul} {...props} />,
              ol: (props) => <ol style={estilos.ol} {...props} />,
              li: (props) => <li style={estilos.li} {...props} />,
              code: ({ inline, ...props }: any) =>
                inline
                  ? <code style={estilos.codeInline} {...props} />
                  : <code style={estilos.codeBlock} {...props} />,
              pre: (props) => <pre style={estilos.pre} {...props} />,
              blockquote: (props) => <blockquote style={estilos.blockquote} {...props} />,
              table: (props) => <div style={estilos.tableWrap}><table style={estilos.table} {...props} /></div>,
              th: (props) => <th style={estilos.th} {...props} />,
              td: (props) => <td style={estilos.td} {...props} />,
              hr: () => <hr style={estilos.hr} />,
              img: (props) => {
                // No MANUAL.md as imagens sao "img/x.png" (relativo a docs/,
                // funciona no preview do VS Code / GitHub). Dentro do app, os
                // PNGs sao servidos de public/manual-img/, entao reescrevemos.
                const src = String((props as any).src || "").replace(/^img\//, "/manual-img/");
                return <img {...props} src={src} loading="lazy" style={estilos.img} />;
              },
              a:  (props) => {
                const href = (props as any).href || "";
                // Ancoras internas (#topico) — fazem scroll dentro do painel
                // em vez de abrir nova aba. Sem isso, target=_blank carregava
                // a app inteira no estado padrao (PDV).
                if (href.startsWith("#")) {
                  return (
                    <a
                      {...props}
                      style={estilos.link}
                      onClick={(e) => {
                        e.preventDefault();
                        const raw = decodeURIComponent(href.slice(1));
                        const root = conteudoRef.current;
                        if (!root) return;
                        let alvo = root.querySelector<HTMLElement>(`[id="${CSS.escape(raw)}"]`);
                        if (!alvo) {
                          // Fallback: normaliza o href via mesmo slugify dos
                          // headings, caso o link no markdown tenha sido
                          // escrito numa forma ligeiramente diferente.
                          alvo = root.querySelector<HTMLElement>(`[id="${CSS.escape(slugify(raw))}"]`);
                        }
                        if (alvo) alvo.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    />
                  );
                }
                return <a style={estilos.link} target="_blank" rel="noopener noreferrer" {...props} />;
              },
              strong: (props) => <strong style={{ color: C.white }} {...props} />,
            }}
          >
            {manualMd}
          </ReactMarkdown>
        </div>

        {/* Botao flutuante "voltar ao topo" — aparece apos rolar > 400px */}
        {mostrarTopo && (
          <button
            onClick={voltarAoTopo}
            title="Voltar ao topo (Home)"
            aria-label="Voltar ao topo"
            style={estilos.botaoTopo}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <span style={{ fontSize: 18 }}>↑</span>
            <span>Topo</span>
          </button>
        )}
      </div>
    </div>
  );
}

// react-markdown passa children como ReactNode. Para gerar slug do heading
// extraimos o texto cru.
function asText(node: any): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(asText).join("");
  if (node.props?.children) return asText(node.props.children);
  return "";
}

const estilos: Record<string, CSSProperties> = {
  shell: {
    display: "grid",
    gridTemplateColumns: "280px 1fr",
    gap: 0,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    overflow: "hidden",
    height: "calc(100vh - 130px)",
    position: "relative",
  },
  sumario: {
    background: C.bg,
    borderRight: `1px solid ${C.border}`,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  cabecalhoSumario: {
    padding: "16px 16px 12px",
    borderBottom: `1px solid ${C.border}`,
    background: `linear-gradient(135deg, ${C.accent}15, ${C.purple}15)`,
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
    border: "none",
    borderRadius: 0,
    transition: "background 0.15s ease",
  },
  tituloAjuda: {
    display: "flex", alignItems: "center", gap: 10,
    color: C.white, fontWeight: 800, fontSize: 18,
  },
  subtituloAjuda: { color: C.muted, fontSize: 11, marginTop: 4 },
  busca: {
    width: "100%", boxSizing: "border-box",
    background: C.card, border: `1px solid ${C.border}`, color: C.text,
    borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none",
  },
  navSumario: { flex: 1, overflowY: "auto", padding: "12px 8px" },
  tituloGrupo: {
    color: C.muted, fontSize: 10, fontWeight: 800,
    textTransform: "uppercase", letterSpacing: 1,
    padding: "8px 12px 4px",
  },
  itemTopico: {
    display: "flex", alignItems: "center", gap: 10,
    width: "100%", border: "none", cursor: "pointer",
    padding: "8px 12px", fontSize: 13, borderRadius: 6,
    transition: "background 0.12s ease",
  },
  conteudo: { overflowY: "auto", background: C.surface },
  conteudoInterno: {
    maxWidth: 880, margin: "0 auto",
    padding: "32px 40px 80px",
    color: C.text, fontSize: 14, lineHeight: 1.7,
  },
  h1: {
    color: C.white, fontSize: 28, fontWeight: 800,
    margin: "0 0 16px", paddingBottom: 12,
    borderBottom: `2px solid ${C.accent}`, scrollMarginTop: 16,
  },
  h2: {
    color: C.white, fontSize: 22, fontWeight: 800,
    margin: "32px 0 12px", paddingBottom: 8,
    borderBottom: `1px solid ${C.border}`, scrollMarginTop: 16,
  },
  h3: {
    color: C.accent, fontSize: 18, fontWeight: 700,
    margin: "24px 0 8px", scrollMarginTop: 16,
  },
  h4: {
    color: C.text, fontSize: 15, fontWeight: 700,
    margin: "16px 0 6px", scrollMarginTop: 16,
  },
  p: { margin: "10px 0", color: C.text },
  ul: { paddingLeft: 22, margin: "8px 0" },
  ol: { paddingLeft: 22, margin: "8px 0" },
  li: { margin: "4px 0", color: C.text },
  codeInline: {
    background: C.card, color: C.accent,
    padding: "2px 6px", borderRadius: 4, fontSize: 12.5,
    fontFamily: "'Consolas','Monaco',monospace",
  },
  codeBlock: {
    color: C.text, fontSize: 12.5,
    fontFamily: "'Consolas','Monaco',monospace",
  },
  pre: {
    background: C.card, border: `1px solid ${C.border}`,
    padding: 14, borderRadius: 8, overflow: "auto",
    margin: "12px 0",
  },
  blockquote: {
    borderLeft: `3px solid ${C.purple}`,
    background: C.purple + "10",
    margin: "12px 0", padding: "8px 14px",
    color: C.text, borderRadius: 4,
  },
  tableWrap: { overflowX: "auto", margin: "12px 0" },
  table: {
    borderCollapse: "collapse",
    width: "100%", fontSize: 13,
    background: C.card, borderRadius: 8, overflow: "hidden",
  },
  th: {
    background: C.surface, color: C.white,
    padding: "10px 12px", textAlign: "left",
    borderBottom: `1px solid ${C.border}`,
    fontWeight: 700, fontSize: 12,
  },
  td: {
    padding: "8px 12px", color: C.text,
    borderBottom: `1px solid ${C.border}`,
  },
  hr: {
    border: "none", borderTop: `1px solid ${C.border}`,
    margin: "24px 0",
  },
  link: { color: C.accent, textDecoration: "underline" },
  img: {
    display: "block", maxWidth: "100%", height: "auto",
    margin: "14px 0", borderRadius: 10,
    border: `1px solid ${C.border}`,
    boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
  },
  botaoTopo: {
    position: "absolute",
    right: 24,
    bottom: 24,
    background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
    color: C.white,
    border: "none",
    borderRadius: 24,
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
    zIndex: 10,
  },
};
