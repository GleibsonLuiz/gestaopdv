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

  return `Você é um desenvolvedor Fullstack experiente.
Estamos desenvolvendo juntos um aplicativo web completo de Gestão + PDV.

## 🛠️ Stack Tecnológica
- Frontend: React.js + TailwindCSS
- Backend: Node.js + Express
- Banco de Dados: PostgreSQL
- Autenticação: JWT
- ORM: Prisma
- Hospedagem: Vercel (front) + Railway (back + DB)

## ✅ Etapas já concluídas
${concluidas || "Nenhuma etapa concluída ainda."}

## 📍 Etapa Atual
${etapaAtual ? `Etapa ${etapaAtual.id} — ${etapaAtual.titulo}\n${ETAPAS[etapaAtual.id-1].descricao}` : "Nenhuma etapa em andamento. Selecione uma etapa para iniciar."}

${notas ? `## 📝 Observações do Projeto\n${notas}` : ""}

## 🎯 Tarefa
Continue o desenvolvimento da etapa atual. Explique os passos de forma detalhada pois tenho pouca experiência com terminal. Ao finalizar cada passo me avise para eu testar antes de continuar.`;
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
        <div style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>{concluidas} de {ETAPAS.length} etapas concluídas</div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["progresso", "📋 Etapas"], ["notas", "📝 Notas"], ["prompt", "🤖 Prompt"]].map(([id, label]) => (
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
