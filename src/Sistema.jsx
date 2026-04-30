import { useMemo, useState } from "react";
import { api } from "./lib/api.js";

const C = {
  bg: "#0f1117", surface: "#1a1d27", card: "#21253a",
  border: "#2e3354", accent: "#4f8ef7", purple: "#7c3aed",
  green: "#22c55e", red: "#ef4444", yellow: "#f59e0b",
  text: "#e2e8f0", muted: "#64748b", white: "#ffffff",
};

const PALAVRA_CHAVE = "CONFIRMAR_RESET";

const TABELAS_LIMPAS = [
  ["🛒", "Vendas e itens de venda"],
  ["🛍", "Compras e itens de compra"],
  ["📊", "Movimentações de estoque"],
  ["📎", "Anexos (PDF/imagens)"],
  ["💸", "Contas a pagar e a receber"],
  ["📦", "Produtos"],
  ["🏷", "Categorias"],
  ["🏭", "Fornecedores"],
  ["👥", "Clientes"],
];

const PRESERVADOS = [
  ["🧑‍💼", "Funcionários (incluindo você)"],
  ["🔐", "Permissões e perfis (ADMIN/GERENTE/VENDEDOR)"],
];

export default function Sistema({ user, onResetar }) {
  const [modalAberto, setModalAberto] = useState(false);

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
          <div>
            <div style={{ color: C.red, fontWeight: 800, fontSize: 18, lineHeight: 1.1 }}>
              Zona de Perigo
            </div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
              Operações irreversíveis. Tenha certeza absoluta antes de prosseguir.
            </div>
          </div>
        </div>

        <div style={{
          background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: 18, display: "grid", gap: 18,
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        }}>
          <div>
            <div style={{
              color: C.red, fontSize: 11, fontWeight: 700, marginBottom: 8,
              textTransform: "uppercase", letterSpacing: 0.5,
            }}>
              ⚠ Será apagado
            </div>
            {TABELAS_LIMPAS.map(([icone, nome]) => (
              <div key={nome} style={{
                color: C.text, fontSize: 13, padding: "4px 0",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ width: 20 }}>{icone}</span>
                <span>{nome}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{
              color: C.green, fontSize: 11, fontWeight: 700, marginBottom: 8,
              textTransform: "uppercase", letterSpacing: 0.5,
            }}>
              ✓ Preservado
            </div>
            {PRESERVADOS.map(([icone, nome]) => (
              <div key={nome} style={{
                color: C.text, fontSize: 13, padding: "4px 0",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ width: 20 }}>{icone}</span>
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
          🗑 RESET TOTAL DO SISTEMA
        </button>
      </div>

      {modalAberto && (
        <ModalReset
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

function ModalReset({ onCancelar, onConcluir }) {
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
            Você está prestes a apagar TODOS os dados operacionais do sistema.
          </div>
        </div>

        <div style={{
          background: C.red + "11", border: `1px solid ${C.red}55`,
          borderRadius: 10, padding: "12px 14px", marginBottom: 16,
          color: C.text, fontSize: 13, lineHeight: 1.5,
        }}>
          Esta ação é <strong style={{ color: C.red }}>IRREVERSÍVEL</strong>.
          Vendas, compras, estoque, financeiro e cadastros (clientes, fornecedores,
          produtos e categorias) serão apagados permanentemente.
          Os funcionários e suas permissões serão preservados.
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
