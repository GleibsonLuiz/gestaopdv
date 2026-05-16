import { useMemo, useState } from "react";
import { C } from "./lib/theme.js";
import { api, getEmpresa } from "./lib/api.js";


const PALAVRA_CHAVE = "CONFIRMAR_RESET";

// Lista organizada em grupos. Cada item reflete uma ou mais tabelas que
// o adminController.resetarSistema apaga via deleteMany() (todas filtradas
// automaticamente por tenant pelo Prisma Extension).
const GRUPOS_LIMPOS = [
  {
    titulo: "Operacional",
    itens: [
      ["🛒", "Vendas e itens de venda"],
      ["📋", "Orçamentos e ordens de serviço"],
      ["💵", "Caixas (abertura/fechamento + extrato)"],
      ["🔄", "Movimentações de caixa (sangria, suprimento, estorno)"],
      ["🛍", "Compras e itens de compra"],
      ["📊", "Movimentações de estoque"],
      ["📎", "Anexos (PDF/imagens) do financeiro"],
      ["💸", "Contas a pagar e a receber"],
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      ["📦", "Produtos (incluindo serviços e fotos)"],
      ["🏷", "Categorias"],
      ["🏭", "Fornecedores"],
      ["👥", "Clientes (e seus contatos B2B)"],
      ["💳", "Formas de pagamento personalizadas"],
    ],
  },
  {
    titulo: "CRM",
    itens: [
      ["🎯", "Oportunidades + histórico (funil de vendas)"],
      ["✅", "Tarefas e follow-ups"],
      ["💬", "Interações com clientes (ligações, WhatsApp, etc.)"],
      ["🏷️", "Tags de clientes"],
      ["📨", "Templates de mensagem (WhatsApp/Email/SMS)"],
      ["⚡", "Regras de automação + logs de execução"],
      ["⭐", "Pesquisas NPS e respostas"],
    ],
  },
  {
    titulo: "Fidelidade",
    itens: [
      ["💎", "Pontos de cliente e movimentações"],
      ["⚙️", "Configuração do programa de fidelidade"],
    ],
  },
];

const PRESERVADOS = [
  ["🧑‍💼", "Funcionários da empresa (incluindo você)"],
  ["🏆", "Configurações de comissão dos vendedores"],
  ["🔐", "Permissões e perfis (ADMIN/GERENTE/VENDEDOR)"],
  ["🏢", "Identidade da empresa (nome, CNPJ, status)"],
  ["📄", "Dados fiscais e de exibição (razão social, endereço, etc.)"],
  ["🖼", "Logotipo da empresa"],
  ["📜", "Logs de auditoria (histórico de ações)"],
];

export default function Sistema({ user, onResetar }) {
  const [modalAberto, setModalAberto] = useState(false);
  const empresa = getEmpresa();

  if (user.role !== "ADMIN") {
    return (
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: 30, textAlign: "center", color: C.muted, fontSize: 14,
      }}>
        🔒 Apenas administradores podem acessar esta área.
      </div>
    );
  }

  return (
    <div>
      <div style={{
        background: C.red + "11", border: `2px solid ${C.red}55`,
        borderRadius: 14, padding: 22, marginBottom: 16,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 12, marginBottom: 14,
        }}>
          <div style={{ fontSize: 28 }}>🚨</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.red, fontWeight: 800, fontSize: 18, lineHeight: 1.1 }}>
              Zona de Perigo — Reset dos dados da empresa
            </div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
              Apaga TODOS os dados operacionais e de CRM apenas da sua empresa
              {empresa?.nome ? ` (${empresa.nome})` : ""}. Outras empresas no sistema não são afetadas.
            </div>
          </div>
        </div>

        {/* Esclarecimento multi-tenant */}
        <div style={{
          background: C.accent + "11", border: `1px solid ${C.accent}55`,
          borderRadius: 10, padding: "10px 14px", marginBottom: 16,
          color: C.text, fontSize: 12, lineHeight: 1.5,
        }}>
          🏢 <strong>Escopo:</strong> esta operação afeta APENAS o tenant logado
          {empresa?.nome ? ` — "${empresa.nome}"` : ""}. O isolamento multi-tenant garante que
          dados de outras empresas no mesmo sistema permanecem intocados.
        </div>

        <div style={{
          background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: 18, display: "grid", gap: 18,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}>
          {/* Coluna 1: Será apagado, com sub-grupos */}
          <div>
            <div style={{
              color: C.red, fontSize: 11, fontWeight: 700, marginBottom: 10,
              textTransform: "uppercase", letterSpacing: 0.5,
            }}>
              ⚠ Será apagado (apenas da sua empresa)
            </div>
            {GRUPOS_LIMPOS.map(grupo => (
              <div key={grupo.titulo} style={{ marginBottom: 12 }}>
                <div style={{
                  color: C.muted, fontSize: 10, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: 0.5,
                  marginBottom: 4, marginTop: 4,
                  borderBottom: `1px solid ${C.border}55`, paddingBottom: 2,
                }}>
                  {grupo.titulo}
                </div>
                {grupo.itens.map(([icone, nome]) => (
                  <div key={nome} style={{
                    color: C.text, fontSize: 12.5, padding: "3px 0",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{ width: 20, flexShrink: 0 }}>{icone}</span>
                    <span>{nome}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Coluna 2: Preservado */}
          <div>
            <div style={{
              color: C.green, fontSize: 11, fontWeight: 700, marginBottom: 10,
              textTransform: "uppercase", letterSpacing: 0.5,
            }}>
              ✓ Preservado
            </div>
            {PRESERVADOS.map(([icone, nome]) => (
              <div key={nome} style={{
                color: C.text, fontSize: 12.5, padding: "5px 0",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ width: 20, flexShrink: 0 }}>{icone}</span>
                <span>{nome}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => setModalAberto(true)}
          style={{
            marginTop: 18, background: C.red, color: C.white,
            border: `1px solid ${C.red}`, borderRadius: 10,
            padding: "12px 22px", fontWeight: 800, fontSize: 14,
            cursor: "pointer", letterSpacing: 0.3,
            boxShadow: `0 4px 14px ${C.red}55`,
          }}
        >
          🗑 RESET TOTAL DOS DADOS DESTA EMPRESA
        </button>
      </div>

      {modalAberto && (
        <ModalReset
          empresa={empresa}
          onCancelar={() => setModalAberto(false)}
          onConcluir={(resumo) => {
            setModalAberto(false);
            onResetar?.(resumo);
          }}
        />
      )}
    </div>
  );
}

function ModalReset({ empresa, onCancelar, onConcluir }) {
  const [texto, setTexto] = useState("");
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState("");

  const habilitado = useMemo(
    () => texto === PALAVRA_CHAVE && !executando,
    [texto, executando],
  );

  async function executar() {
    if (!habilitado) return;
    setErro("");
    setExecutando(true);
    try {
      const resp = await api.resetarSistema(PALAVRA_CHAVE);
      onConcluir(resp);
    } catch (err) {
      setErro(err.message);
      setExecutando(false);
    }
  }

  return (
    <div onClick={() => !executando && onCancelar()} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 200,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.card, border: `2px solid ${C.red}`, borderRadius: 14,
        width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", padding: 28,
      }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 42, lineHeight: 1 }}>⚠</div>
          <div style={{
            color: C.red, fontWeight: 800, fontSize: 20, marginTop: 10,
          }}>
            CONFIRMAÇÃO CRÍTICA
          </div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 6 }}>
            Você está prestes a apagar TODOS os dados operacionais e de CRM
            {empresa?.nome ? ` da empresa "${empresa.nome}"` : " da sua empresa"}.
          </div>
        </div>

        <div style={{
          background: C.red + "11", border: `1px solid ${C.red}55`,
          borderRadius: 10, padding: "12px 14px", marginBottom: 16,
          color: C.text, fontSize: 13, lineHeight: 1.5,
        }}>
          Esta ação é <strong style={{ color: C.red }}>IRREVERSÍVEL</strong>.
          Vendas, caixas, compras, estoque, financeiro, cadastros (clientes,
          fornecedores, produtos, categorias), formas de pagamento personalizadas
          e todos os dados de CRM (funil, tarefas, interações, NPS, automações,
          tags, templates) serão apagados permanentemente. Os funcionários, comissões,
          permissões, identidade da empresa, logotipo e logs de auditoria serão preservados.
          {empresa?.nome ? ` Outras empresas no sistema NÃO são afetadas.` : ""}
        </div>

        <div style={{
          color: C.muted, fontSize: 12, fontWeight: 600, marginBottom: 6,
        }}>
          Para habilitar o botão, digite{" "}
          <code style={{
            background: C.surface, color: C.red, padding: "2px 6px",
            borderRadius: 4, fontWeight: 700,
          }}>{PALAVRA_CHAVE}</code>
          {" "}exatamente:
        </div>
        <input
          type="text"
          value={texto}
          onChange={e => setTexto(e.target.value)}
          disabled={executando}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          placeholder={PALAVRA_CHAVE}
          style={{
            width: "100%", boxSizing: "border-box",
            background: C.surface,
            border: `2px solid ${texto === PALAVRA_CHAVE ? C.red : C.border}`,
            borderRadius: 8, padding: "10px 14px",
            color: texto === PALAVRA_CHAVE ? C.red : C.text,
            fontSize: 14, fontFamily: "monospace", fontWeight: 700,
            outline: "none", letterSpacing: 1,
          }}
        />

        {erro && (
          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 8,
            background: C.red + "22", border: `1px solid ${C.red}55`,
            color: C.red, fontSize: 13,
          }}>{erro}</div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button
            type="button"
            onClick={onCancelar}
            disabled={executando}
            style={{
              flex: 1, background: C.surface, border: `1px solid ${C.border}`,
              color: C.text, borderRadius: 8,
              padding: "12px 18px", fontWeight: 700, fontSize: 13,
              cursor: executando ? "default" : "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={executar}
            disabled={!habilitado}
            style={{
              flex: 1,
              background: habilitado ? C.red : C.surface,
              color: habilitado ? C.white : C.muted,
              border: `1px solid ${habilitado ? C.red : C.border}`,
              borderRadius: 8,
              padding: "12px 18px", fontWeight: 800, fontSize: 13,
              cursor: habilitado ? "pointer" : "not-allowed",
              letterSpacing: 0.3,
              boxShadow: habilitado ? `0 4px 14px ${C.red}55` : "none",
            }}
          >
            {executando ? "🗑 Apagando..." : "🗑 Executar Reset"}
          </button>
        </div>
      </div>
    </div>
  );
}
