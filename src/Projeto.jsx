import { useState, useEffect } from "react";
import { C } from "./lib/theme.js";

const ETAPAS = [
  { id: 1, titulo: "Estrutura Base + Banco de Dados", descricao: "Criar estrutura de pastas, configurar PostgreSQL com Prisma", icone: "🏗️" },
  { id: 2, titulo: "Autenticação + Controle de Acesso", descricao: "Tela de login, JWT, perfis: Admin, Gerente, Vendedor", icone: "🔐" },
  { id: 3, titulo: "Dashboard", descricao: "Tela inicial com gráficos, alertas e resumo do negócio", icone: "📊" },
  { id: 4, titulo: "Cadastro de Clientes", descricao: "CRUD completo de clientes com integração ao banco", icone: "👥" },
  { id: 5, titulo: "Cadastro de Fornecedores", descricao: "CRUD completo de fornecedores", icone: "🏭" },
  { id: 6, titulo: "Cadastro de Produtos", descricao: "CRUD de produtos vinculado ao fornecedor", icone: "📦" },
  { id: 7, titulo: "Controle de Estoque", descricao: "Estoque integrado aos produtos", icone: "🗃️" },
  { id: 8, titulo: "Cadastro de Funcionários", descricao: "CRUD de funcionários com vínculo ao controle de acesso", icone: "🧑‍💼" },
  { id: 9, titulo: "Compras", descricao: "Módulo de compras vinculado a fornecedores e produtos", icone: "🛍️" },
  { id: 10, titulo: "PDV — Ponto de Venda", descricao: "Tela de venda integrando clientes, produtos e estoque", icone: "🛒" },
  { id: 11, titulo: "Financeiro", descricao: "Contas a pagar/receber, fluxo de caixa", icone: "💰" },
  { id: 12, titulo: "Notificações e Alertas", descricao: "Alertas de estoque baixo e contas a vencer", icone: "🔔" },
  { id: 13, titulo: "Relatórios + Exportação PDF", descricao: "Relatórios completos com exportação em PDF", icone: "📈" },
];

// Melhorias entregues APOS o MVP (etapas 1-13). Sao recursos novos ou
// aprofundamentos das etapas originais. Editavel aqui sem precisar mexer
// em STATUS_PROJETO ou no progresso geral.
const EXTRAS = [
  {
    id: "permissoes",
    icone: "🔐",
    categoria: "Recurso novo",
    titulo: "Permissões por Módulo",
    descricao: "10 módulos toggláveis por funcionário (PDV, DASHBOARD, CLIENTES, etc). Middleware requirePermissao no backend para defesa em profundidade — não basta ter token de ADMIN.",
    detalhes: [
      "Coluna User.permissoes (text[]) com migração",
      "Source-of-truth em src/lib/permissoes.js (front e back)",
      "Modal de funcionário com 10 cards-switch",
      "NavItem condicional via podeAcessar(user, MODULO)",
    ],
  },
  {
    id: "sidebar-retratil",
    icone: "📐",
    categoria: "Recurso novo",
    titulo: "Sidebar Retrátil",
    descricao: "Sidebar alterna entre 240px (expandida) e 72px (recolhida) com transição suave de 0.25s. Preferência persistida em localStorage com TODO para sync com backend.",
    detalhes: [
      "Wrappers Item/Secao injetam collapsed em todos os NavItems",
      "Tooltip via title= no modo recolhido",
      "Mobile preserva off-canvas com hamburger",
      "PDV ganha espaço automaticamente (grid 1fr 420px)",
    ],
  },
  {
    id: "temas",
    icone: "🎨",
    categoria: "Recurso novo",
    titulo: "Sistema de Temas",
    descricao: "4 paletas (Azul Padrão, Esmeralda, Roxo, Alto Contraste) via CSS Variables. Mudança aplicada em runtime sem re-render React.",
    detalhes: [
      "src/lib/theme.js com TEMAS, aplicarTema, lerTemaSalvo, salvarTema",
      "C canônico apontando para var(--*) — substitui 17 cópias locais",
      "Modal Aparência com preview ao vivo de cada paleta",
      "Inicialização no main.jsx evita flash do tema padrão",
    ],
  },
  {
    id: "reset-sistema",
    icone: "🛡",
    categoria: "Recurso novo",
    titulo: "Reset Total do Sistema",
    descricao: "Tela administrativa Sistema com operação destrutiva protegida por palavra-chave CONFIRMAR_RESET. Limpa dados operacionais em transação, preserva usuários.",
    detalhes: [
      "POST /admin/reset com 3 camadas: token + role ADMIN + palavra-chave",
      "Limpeza em prisma.$transaction respeitando ordem de FKs",
      "Modal exige digitar palavra-chave para habilitar botão",
      "Apaga arquivos físicos em backend/uploads/ (best-effort)",
    ],
  },
  {
    id: "fin-avancado",
    icone: "💸",
    categoria: "Aprofundamento — Etapa 11",
    titulo: "Financeiro Avançado",
    descricao: "Juros, multa, desconto com cálculo de líquido em tempo real. Recorrência (parcelada/recorrente, 2-60). Anexos PDF/JPG/PNG até 5MB com cascade.",
    detalhes: [
      "valorBruto + juros + multa - desconto = valor líquido",
      "Parcelada: divide bruto, ajuste de centavos na última",
      "Recorrente: mesmo valor em meses subsequentes",
      "Upload via multer, dropzone visual no frontend",
    ],
  },
  {
    id: "hard-delete",
    icone: "🗑",
    categoria: "Aprofundamento — Cadastros",
    titulo: "Excluir Permanente (hard-delete)",
    descricao: "Botão Excluir vermelho separado do Inativar em Fornecedores/Clientes/Produtos. Backend valida FK e retorna mensagem amigável quando bloqueado.",
    detalhes: [
      "DELETE /:id?permanente=true em 3 controllers",
      "P2003 retornado como 409 com mensagem orientadora",
      "Confirmação dupla: window.confirm com texto explícito",
      "Categoria já era hard-delete desde antes",
    ],
  },
  {
    id: "pdv-ux",
    icone: "🛒",
    categoria: "Aprofundamento — Etapa 10",
    titulo: "PDV — Atalhos, Troco e Cupom",
    descricao: "Atalhos de teclado, cálculo de troco em tempo real, modal de pagamento e impressão de cupom. UX otimizada para operação rápida no caixa.",
    detalhes: [
      "Atalhos para finalizar e adicionar produto",
      "Troco recalculado conforme digita o valor recebido",
      "Modal de pagamento com forma + valor",
      "Cupom imprimível pós-venda",
    ],
  },
  {
    id: "clientes-mascaras",
    icone: "👥",
    categoria: "Aprofundamento — Etapa 4",
    titulo: "Clientes — Máscaras + ViaCEP",
    descricao: "Máscara de CPF/CNPJ automática, busca de endereço pelo CEP via API ViaCEP, validação de campos e separação de número da rua.",
    detalhes: [
      "mascararCpfCnpj(): formata 11 ou 14 dígitos automaticamente",
      "buscarCepViaCEP(): preenche endereço/cidade/estado",
      "Campo número separado para evitar regex no save",
      "27 estados BR no select",
    ],
  },
  {
    id: "auth-robusta",
    icone: "🔒",
    categoria: "Aprofundamento — Etapa 2",
    titulo: "Auth Robusta",
    descricao: "Trocar senha com validação client+server, rate limit no login (10 tentativas / 15 min por IP) e remoção de credenciais hardcoded.",
    detalhes: [
      "PUT /auth/senha com bcrypt.compare + bcrypt.hash",
      "Janela deslizante em memória, HTTP 429 + Retry-After",
      "Modal Trocar Senha acessível pelo dropdown do usuário",
      "Login limpa cache de tentativas em sucesso",
    ],
  },
];

// Status real do projeto (sincronizado com PROGRESSO.md). Usado como fallback
// quando uma etapa nao tem registro no localStorage do usuario.
const STATUS_PROJETO = {
  1: "concluido", 2: "concluido", 3: "concluido", 4: "concluido",
  5: "concluido", 6: "concluido", 7: "concluido", 8: "concluido",
  9: "concluido", 10: "concluido", 11: "concluido", 12: "concluido",
  13: "concluido",
};

function defaultEtapas() {
  return ETAPAS.map(e => ({ id: e.id, status: STATUS_PROJETO[e.id] || "pendente" }));
}

function mergeEtapas(salvas) {
  return ETAPAS.map(e => {
    const existente = salvas.find(s => s.id === e.id);
    if (existente && existente.status) return { id: e.id, status: existente.status };
    return { id: e.id, status: STATUS_PROJETO[e.id] || "pendente" };
  });
}

const STATUS = {
  pendente: { label: "Pendente", color: "#475569", bg: "#47556922" },
  em_andamento: { label: "Em andamento", color: "#f59e0b", bg: "#f59e0b22" },
  testando: { label: "Testando", color: "#4f8ef7", bg: "#4f8ef722" },
  concluido: { label: "Concluído", color: "#22c55e", bg: "#22c55e22" },
};


function gerarPrompt(etapas, notas) {
  const atual = etapas.find(e => e.status === "em_andamento") || etapas.find(e => e.status === "testando");
  const concluidas = etapas.filter(e => e.status === "concluido").map(e => `✅ Etapa ${e.id} — ${ETAPAS[e.id-1].titulo}`).join("\n");
  const etapaAtual = atual ? ETAPAS[atual.id - 1] : null;
  const extrasLista = EXTRAS.map(x => `✨ ${x.titulo} — ${x.descricao}`).join("\n");

  return `Você é um desenvolvedor Fullstack experiente.
Estamos desenvolvendo juntos o GestãoPRO — sistema web completo de Gestão + PDV.

## 🛠️ Stack Tecnológica (real)
- Frontend: React 19 + Vite (estilos inline com paleta C via CSS Variables — sem Tailwind)
- Backend: Node.js + Express
- Banco de Dados: PostgreSQL (Neon)
- ORM: Prisma
- Autenticação: JWT + bcrypt
- Permissões: roles (ADMIN/GERENTE/VENDEDOR) + permissões por módulo (User.permissoes String[])
- Anexos: multer com diskStorage em backend/uploads/

## ✅ Etapas concluídas (1-13)
${concluidas || "Nenhuma etapa concluída ainda."}

## ✨ Melhorias entregues após o MVP
${extrasLista}

## 📍 Etapa Atual
${etapaAtual ? `Etapa ${etapaAtual.id} — ${etapaAtual.titulo}\n${ETAPAS[etapaAtual.id-1].descricao}` : "Todas as 13 etapas concluídas. Próximas opções: cancelamento de compra com estorno, sync de preferências (sidebar/tema) com Postgres, ou novos recursos."}

${notas ? `## 📝 Observações do Projeto\n${notas}` : ""}

## 📐 Convenções do projeto
- Cada feature: controller + route + página, registro em server.js
- Mutações usam requireRole e/ou requirePermissao
- Mensagens de erro em português sem acentos (ex: "Codigo e obrigatorio")
- P2002 → 409, P2003 → 400/409 (FK), P2025 → 404
- Operações que mexem em estoque usam prisma.\$transaction
- Frontend: import { C } from "./lib/theme.js" para cores (CSS vars dinâmicas por tema)
- Continuar sempre em pt-BR com idioma consistente

## 🎯 Tarefa
Continue o desenvolvimento. Explique os passos de forma detalhada pois tenho pouca experiência com terminal. Ao finalizar cada passo me avise para eu testar antes de continuar.`;
}

export default function Projeto() {
  const [etapas, setEtapas] = useState(defaultEtapas);
  const [notas, setNotas] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [tab, setTab] = useState("progresso");

  useEffect(() => {
    try {
      const e = localStorage.getItem("gestao_etapas");
      if (e) {
        const salvas = JSON.parse(e);
        const mergeadas = mergeEtapas(Array.isArray(salvas) ? salvas : []);
        setEtapas(mergeadas);
        // se faltavam etapas no localStorage (cache antigo), persiste o merge
        if (!Array.isArray(salvas) || salvas.length !== mergeadas.length) {
          localStorage.setItem("gestao_etapas", JSON.stringify(mergeadas));
        }
      }
      const n = localStorage.getItem("gestao_notas");
      if (n) setNotas(n);
    } catch {}
  }, []);

  function ressincronizar() {
    if (!confirm("Sincronizar status com o estado real do projeto? Suas marcações manuais serão substituídas.")) return;
    salvarEtapas(defaultEtapas());
  }

  function salvarEtapas(novas) {
    setEtapas(novas);
    try { localStorage.setItem("gestao_etapas", JSON.stringify(novas)); } catch {}
  }

  function salvarNotas(v) {
    setNotas(v);
    try { localStorage.setItem("gestao_notas", v); } catch {}
  }

  function mudarStatus(id, status) {
    salvarEtapas(etapas.map(e => e.id === id ? { ...e, status } : e));
  }

  function copiarPrompt() {
    const texto = gerarPrompt(etapas, notas);
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    });
  }

  const concluidas = etapas.filter(e => e.status === "concluido").length;
  const progresso = Math.round((concluidas / ETAPAS.length) * 100);

  return (
    <div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ color: C.white, fontWeight: 700 }}>Progresso Geral</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={ressincronizar} title="Substituir status pelos dados do PROGRESSO.md" style={{
              background: C.surface, border: `1px solid ${C.border}`, color: C.muted,
              borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}>
              🔄 Ressincronizar
            </button>
            <div style={{ color: C.accent, fontWeight: 800 }}>{progresso}%</div>
          </div>
        </div>
        <div style={{ background: C.border, borderRadius: 999, height: 10 }}>
          <div style={{ width: `${progresso}%`, background: `linear-gradient(90deg, ${C.accent}, ${C.purple})`, height: 10, borderRadius: 999, transition: "width 0.5s" }} />
        </div>
        <div style={{
          color: C.muted, fontSize: 12, marginTop: 8,
          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
        }}>
          <span>{concluidas} de {ETAPAS.length} etapas concluídas</span>
          <span style={{
            background: C.purple + "22", color: C.purple,
            border: `1px solid ${C.purple}55`, borderRadius: 6,
            padding: "3px 10px", fontSize: 11, fontWeight: 700,
          }}>
            ✨ +{EXTRAS.length} melhorias entregues
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          ["progresso", "📋 Etapas"],
          ["extras", `✨ Extras (${EXTRAS.length})`],
          ["notas", "📝 Notas"],
          ["prompt", "🤖 Prompt"],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
            background: tab === id ? C.accent : C.card,
            color: tab === id ? C.white : C.muted,
          }}>{label}</button>
        ))}
      </div>

      {tab === "progresso" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ETAPAS.map((etapa) => {
            const estado = etapas.find(e => e.id === etapa.id) || { status: "pendente" };
            const st = STATUS[estado.status];
            return (
              <div key={etapa.id} style={{
                background: C.card, border: `1px solid ${estado.status === "em_andamento" ? C.yellow + "88" : estado.status === "concluido" ? C.green + "44" : C.border}`,
                borderRadius: 12, padding: 16, display: "flex", alignItems: "center", gap: 14,
              }}>
                <div style={{ fontSize: 28, minWidth: 36, textAlign: "center" }}>{etapa.icone}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ color: C.muted, fontSize: 12 }}>Etapa {etapa.id}</span>
                    <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}44`, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>{st.label}</span>
                  </div>
                  <div style={{ color: C.white, fontWeight: 700, fontSize: 14, marginTop: 2 }}>{etapa.titulo}</div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{etapa.descricao}</div>
                </div>
                <select value={estado.status} onChange={e => mudarStatus(etapa.id, e.target.value)} style={{
                  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: "7px 10px", color: C.text, fontSize: 12, cursor: "pointer", minWidth: 130,
                }}>
                  <option value="pendente">⏳ Pendente</option>
                  <option value="em_andamento">🔧 Em andamento</option>
                  <option value="testando">🧪 Testando</option>
                  <option value="concluido">✅ Concluído</option>
                </select>
              </div>
            );
          })}
        </div>
      )}

      {tab === "extras" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{
            background: C.purple + "11", border: `1px solid ${C.purple}55`,
            borderRadius: 12, padding: "14px 18px", marginBottom: 4,
          }}>
            <div style={{ color: C.purple, fontWeight: 800, fontSize: 14, marginBottom: 4 }}>
              ✨ Melhorias entregues após o MVP
            </div>
            <div style={{ color: C.muted, fontSize: 12 }}>
              Recursos novos e aprofundamentos das 13 etapas originais. Cada item já está em produção.
            </div>
          </div>
          {EXTRAS.map(extra => (
            <div key={extra.id} style={{
              background: C.card, border: `1px solid ${C.green}44`,
              borderRadius: 12, padding: 16,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ fontSize: 28, minWidth: 36, textAlign: "center", lineHeight: 1 }}>
                  {extra.icone}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{
                      color: C.muted, fontSize: 11, fontWeight: 600,
                      textTransform: "uppercase", letterSpacing: 0.5,
                    }}>
                      {extra.categoria}
                    </span>
                    <span style={{
                      background: C.green + "22", color: C.green,
                      border: `1px solid ${C.green}55`, borderRadius: 6,
                      padding: "2px 10px", fontSize: 11, fontWeight: 700,
                    }}>✅ Concluído</span>
                  </div>
                  <div style={{ color: C.white, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                    {extra.titulo}
                  </div>
                  <div style={{ color: C.text, fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
                    {extra.descricao}
                  </div>
                  <ul style={{
                    listStyle: "none", padding: 0, margin: 0,
                    display: "grid", gap: 4,
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  }}>
                    {extra.detalhes.map((d, i) => (
                      <li key={i} style={{
                        color: C.muted, fontSize: 12,
                        paddingLeft: 14, position: "relative", lineHeight: 1.4,
                      }}>
                        <span style={{ color: C.accent, position: "absolute", left: 0 }}>›</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "notas" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ color: C.white, fontWeight: 700, marginBottom: 12 }}>📝 Observações do Projeto</div>
          <textarea value={notas} onChange={e => salvarNotas(e.target.value)}
            placeholder="Anote decisões, problemas, mudanças..."
            style={{
              width: "100%", minHeight: 260, background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: 14, color: C.text, fontSize: 13, resize: "vertical",
              fontFamily: "inherit", boxSizing: "border-box", outline: "none", lineHeight: 1.6,
            }}
          />
          <div style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>💾 Salvo automaticamente</div>
        </div>
      )}

      {tab === "prompt" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ color: C.white, fontWeight: 700 }}>🤖 Prompt Gerado</div>
            <button onClick={copiarPrompt} style={{
              background: copiado ? C.green : C.accent, color: C.white, border: "none",
              borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>
              {copiado ? "✅ Copiado!" : "📋 Copiar"}
            </button>
          </div>
          <pre style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: 16, color: C.text, fontSize: 12, whiteSpace: "pre-wrap",
            wordBreak: "break-word", lineHeight: 1.7, maxHeight: 400, overflowY: "auto",
            fontFamily: "monospace",
          }}>
            {gerarPrompt(etapas, notas)}
          </pre>
        </div>
      )}
    </div>
  );
}
