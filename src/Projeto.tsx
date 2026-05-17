import { useState, useEffect } from "react";
import { C } from "./lib/theme";

interface Etapa {
  id: number;
  titulo: string;
  descricao: string;
  icone: string;
}

interface Extra {
  id: string;
  icone: string;
  categoria: string;
  titulo: string;
  descricao: string;
  detalhes: string[];
}

type StatusEtapa = "pendente" | "em_andamento" | "testando" | "concluido";

interface EtapaSalva {
  id: number;
  status: StatusEtapa;
}

type Tab = "progresso" | "extras" | "notas" | "prompt";

const ETAPAS: Etapa[] = [
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
const EXTRAS: Extra[] = [
  {
    id: "permissoes",
    icone: "🔐",
    categoria: "Recurso novo",
    titulo: "Permissões por Módulo",
    descricao: "10 módulos toggláveis por funcionário (PDV, DASHBOARD, CLIENTES, etc). Middleware requirePermissao no backend para defesa em profundidade — não basta ter token de ADMIN.",
    detalhes: [
      "Coluna User.permissoes (text[]) com migração",
      "Source-of-truth em src/lib/permissoes.ts (front e back)",
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
      "src/lib/theme.ts com TEMAS, aplicarTema, lerTemaSalvo, salvarTema",
      "C canônico apontando para var(--*) — substitui 17 cópias locais",
      "Modal Aparência com preview ao vivo de cada paleta",
      "Inicialização no main.tsx evita flash do tema padrão",
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
const STATUS_PROJETO: Record<number, StatusEtapa> = {
  1: "concluido", 2: "concluido", 3: "concluido", 4: "concluido",
  5: "concluido", 6: "concluido", 7: "concluido", 8: "concluido",
  9: "concluido", 10: "concluido", 11: "concluido", 12: "concluido",
  13: "concluido",
};

function defaultEtapas(): EtapaSalva[] {
  return ETAPAS.map((e) => ({ id: e.id, status: STATUS_PROJETO[e.id] || "pendente" }));
}

function mergeEtapas(salvas: EtapaSalva[]): EtapaSalva[] {
  return ETAPAS.map((e) => {
    const existente = salvas.find((s) => s.id === e.id);
    if (existente && existente.status) return { id: e.id, status: existente.status };
    return { id: e.id, status: STATUS_PROJETO[e.id] || "pendente" };
  });
}

const STATUS: Record<StatusEtapa, { label: string; color: string; bg: string }> = {
  pendente:     { label: "Pendente",     color: "#475569", bg: "#47556922" },
  em_andamento: { label: "Em andamento", color: "#f59e0b", bg: "#f59e0b22" },
  testando:     { label: "Testando",     color: "#4f8ef7", bg: "#4f8ef722" },
  concluido:    { label: "Concluído",    color: "#22c55e", bg: "#22c55e22" },
};


function gerarPrompt(etapas: EtapaSalva[], notas: string): string {
  const atual = etapas.find((e) => e.status === "em_andamento") || etapas.find((e) => e.status === "testando");
  const concluidas = etapas.filter((e) => e.status === "concluido").map((e) => `✅ Etapa ${e.id} — ${ETAPAS[e.id - 1].titulo}`).join("\n");
  const etapaAtual = atual ? ETAPAS[atual.id - 1] : null;
  const extrasLista = EXTRAS.map((x) => `✨ ${x.titulo} — ${x.descricao}`).join("\n");

  return `Você é um desenvolvedor Fullstack experiente.
Estamos desenvolvendo juntos o GestãoPRO — sistema web completo de Gestão + PDV.

## 🛠️ Stack Tecnológica (real)
- Frontend: React 19 + Vite + TypeScript + Tailwind (migração em andamento)
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
${etapaAtual ? `Etapa ${etapaAtual.id} — ${etapaAtual.titulo}\n${ETAPAS[etapaAtual.id - 1].descricao}` : "Todas as 13 etapas concluídas. Próximas opções: cancelamento de compra com estorno, sync de preferências (sidebar/tema) com Postgres, ou novos recursos."}

${notas ? `## 📝 Observações do Projeto\n${notas}` : ""}

## 📐 Convenções do projeto
- Cada feature: controller + route + página, registro em server.js
- Mutações usam requireRole e/ou requirePermissao
- Mensagens de erro em português sem acentos (ex: "Codigo e obrigatorio")
- P2002 → 409, P2003 → 400/409 (FK), P2025 → 404
- Operações que mexem em estoque usam prisma.\$transaction
- Frontend: import { C } from "./lib/theme" para cores (CSS vars dinâmicas por tema)
- Continuar sempre em pt-BR com idioma consistente

## 🎯 Tarefa
Continue o desenvolvimento. Explique os passos de forma detalhada pois tenho pouca experiência com terminal. Ao finalizar cada passo me avise para eu testar antes de continuar.`;
}

export default function Projeto() {
  const [etapas, setEtapas] = useState<EtapaSalva[]>(defaultEtapas);
  const [notas, setNotas] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [tab, setTab] = useState<Tab>("progresso");

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
    } catch {
      /* localStorage indisponivel */
    }
  }, []);

  function ressincronizar() {
    if (!confirm("Sincronizar status com o estado real do projeto? Suas marcações manuais serão substituídas.")) return;
    salvarEtapas(defaultEtapas());
  }

  function salvarEtapas(novas: EtapaSalva[]) {
    setEtapas(novas);
    try { localStorage.setItem("gestao_etapas", JSON.stringify(novas)); } catch { /* ignore */ }
  }

  function salvarNotas(v: string) {
    setNotas(v);
    try { localStorage.setItem("gestao_notas", v); } catch { /* ignore */ }
  }

  function mudarStatus(id: number, status: StatusEtapa) {
    salvarEtapas(etapas.map((e) => e.id === id ? { ...e, status } : e));
  }

  function copiarPrompt() {
    const texto = gerarPrompt(etapas, notas);
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    });
  }

  const concluidas = etapas.filter((e) => e.status === "concluido").length;
  const progresso = Math.round((concluidas / ETAPAS.length) * 100);

  const TABS: [Tab, string][] = [
    ["progresso", "📋 Etapas"],
    ["extras", `✨ Extras (${EXTRAS.length})`],
    ["notas", "📝 Notas"],
    ["prompt", "🤖 Prompt"],
  ];

  return (
    <div>
      <div className="bg-gp-card border border-gp-border rounded-xl p-5 mb-4">
        <div className="flex justify-between mb-[10px] items-center gap-[10px] flex-wrap">
          <div className="text-gp-white font-bold">Progresso Geral</div>
          <div className="flex gap-[10px] items-center">
            <button
              onClick={ressincronizar}
              title="Substituir status pelos dados do PROGRESSO.md"
              className="bg-gp-surface border border-gp-border text-gp-muted rounded-lg px-3 py-[6px] text-[11px] font-semibold cursor-pointer"
            >
              🔄 Ressincronizar
            </button>
            <div className="text-gp-accent font-extrabold">{progresso}%</div>
          </div>
        </div>
        <div className="bg-gp-border rounded-full h-[10px]">
          <div
            className="h-[10px] rounded-full transition-all duration-500"
            style={{ width: `${progresso}%`, background: `linear-gradient(90deg, ${C.accent}, ${C.purple})` }}
          />
        </div>
        <div className="text-gp-muted text-xs mt-2 flex justify-between items-center flex-wrap gap-2">
          <span>{concluidas} de {ETAPAS.length} etapas concluídas</span>
          <span
            className="text-gp-purple rounded-md px-[10px] py-[3px] text-[11px] font-bold"
            style={{ background: C.purple + "22", border: `1px solid ${C.purple}55` }}
          >
            ✨ +{EXTRAS.length} melhorias entregues
          </span>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-[18px] py-2 rounded-lg border-none cursor-pointer font-semibold text-[13px] ${
              tab === id ? "bg-gp-accent text-gp-white" : "bg-gp-card text-gp-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "progresso" && (
        <div className="flex flex-col gap-[10px]">
          {ETAPAS.map((etapa) => {
            const estado = etapas.find((e) => e.id === etapa.id) || { status: "pendente" as StatusEtapa };
            const st = STATUS[estado.status];
            const borderColor =
              estado.status === "em_andamento" ? C.yellow + "88" :
              estado.status === "concluido" ? C.green + "44" : C.border;
            return (
              <div
                key={etapa.id}
                className="bg-gp-card rounded-xl p-4 flex items-center gap-[14px]"
                style={{ border: `1px solid ${borderColor}` }}
              >
                <div className="text-[28px] min-w-9 text-center">{etapa.icone}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-[10px] flex-wrap">
                    <span className="text-gp-muted text-xs">Etapa {etapa.id}</span>
                    <span
                      className="rounded-md px-[10px] py-[2px] text-[11px] font-semibold"
                      style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}44` }}
                    >
                      {st.label}
                    </span>
                  </div>
                  <div className="text-gp-white font-bold text-sm mt-[2px]">{etapa.titulo}</div>
                  <div className="text-gp-muted text-xs mt-[2px]">{etapa.descricao}</div>
                </div>
                <select
                  value={estado.status}
                  onChange={(e) => mudarStatus(etapa.id, e.target.value as StatusEtapa)}
                  className="bg-gp-surface border border-gp-border rounded-lg px-[10px] py-[7px] text-gp-text text-xs cursor-pointer min-w-[130px]"
                >
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
        <div className="flex flex-col gap-[10px]">
          <div
            className="rounded-xl px-[18px] py-[14px] mb-1"
            style={{ background: C.purple + "11", border: `1px solid ${C.purple}55` }}
          >
            <div className="text-gp-purple font-extrabold text-sm mb-1">
              ✨ Melhorias entregues após o MVP
            </div>
            <div className="text-gp-muted text-xs">
              Recursos novos e aprofundamentos das 13 etapas originais. Cada item já está em produção.
            </div>
          </div>
          {EXTRAS.map((extra) => (
            <div
              key={extra.id}
              className="bg-gp-card rounded-xl p-4"
              style={{ border: `1px solid ${C.green}44` }}
            >
              <div className="flex items-start gap-[14px]">
                <div className="text-[28px] min-w-9 text-center leading-none">{extra.icone}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-gp-muted text-[11px] font-semibold uppercase tracking-[0.5px]">
                      {extra.categoria}
                    </span>
                    <span
                      className="text-gp-green rounded-md px-[10px] py-[2px] text-[11px] font-bold"
                      style={{ background: C.green + "22", border: `1px solid ${C.green}55` }}
                    >
                      ✅ Concluído
                    </span>
                  </div>
                  <div className="text-gp-white font-bold text-[15px] mb-1">{extra.titulo}</div>
                  <div className="text-gp-text text-[13px] leading-[1.5] mb-[10px]">{extra.descricao}</div>
                  <ul
                    className="list-none p-0 m-0 grid gap-1"
                    style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
                  >
                    {extra.detalhes.map((d, i) => (
                      <li
                        key={i}
                        className="text-gp-muted text-xs pl-[14px] relative leading-[1.4]"
                      >
                        <span className="text-gp-accent absolute left-0">›</span>
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
        <div className="bg-gp-card border border-gp-border rounded-xl p-5">
          <div className="text-gp-white font-bold mb-3">📝 Observações do Projeto</div>
          <textarea
            value={notas}
            onChange={(e) => salvarNotas(e.target.value)}
            placeholder="Anote decisões, problemas, mudanças..."
            className="w-full min-h-[260px] bg-gp-surface border border-gp-border rounded-[10px] p-[14px] text-gp-text text-[13px] resize-y box-border outline-none leading-[1.6]"
            style={{ fontFamily: "inherit" }}
          />
          <div className="text-gp-muted text-[11px] mt-2">💾 Salvo automaticamente</div>
        </div>
      )}

      {tab === "prompt" && (
        <div className="bg-gp-card border border-gp-border rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <div className="text-gp-white font-bold">🤖 Prompt Gerado</div>
            <button
              onClick={copiarPrompt}
              className={`text-gp-white border-none rounded-lg px-4 py-2 font-bold text-[13px] cursor-pointer ${
                copiado ? "bg-gp-green" : "bg-gp-accent"
              }`}
            >
              {copiado ? "✅ Copiado!" : "📋 Copiar"}
            </button>
          </div>
          <pre className="bg-gp-surface border border-gp-border rounded-[10px] p-4 text-gp-text text-xs whitespace-pre-wrap break-words leading-[1.7] max-h-[400px] overflow-y-auto font-mono">
            {gerarPrompt(etapas, notas)}
          </pre>
        </div>
      )}
    </div>
  );
}
