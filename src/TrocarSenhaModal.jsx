import { useState } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";


export default function TrocarSenhaModal({ onFechar }) {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (!senhaAtual || !senhaNova) {
      setErro("Preencha todos os campos");
      return;
    }
    if (senhaNova.length < 6) {
      setErro("A nova senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (senhaNova === senhaAtual) {
      setErro("A nova senha deve ser diferente da atual");
      return;
    }
    if (senhaNova !== confirmar) {
      setErro("A confirmação não confere com a nova senha");
      return;
    }

    setSalvando(true);
    try {
      await api.trocarSenha(senhaAtual, senhaNova);
      setSucesso(true);
      setTimeout(() => onFechar(), 1500);
    } catch (err) {
      setErro(err.message || "Falha ao trocar senha");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onFechar()} style={modalOverlay}>
      <form onSubmit={salvar} onClick={e => e.stopPropagation()} style={modalCard}>
        <div style={modalHeader}>
          <div>
            <div style={{ color: C.white, fontWeight: 700, fontSize: 18 }}>🔐 Trocar senha</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
              Defina uma nova senha de acesso
            </div>
          </div>
          <button type="button" onClick={onFechar} disabled={salvando} style={btnFechar}>×</button>
        </div>

        {sucesso ? (
          <div style={{
            padding: "16px 14px", borderRadius: 8,
            background: C.green + "22", border: `1px solid ${C.green}55`,
            color: C.green, fontSize: 14, fontWeight: 600, textAlign: "center",
          }}>
            ✓ Senha alterada com sucesso
          </div>
        ) : (
          <>
            <Campo label="Senha atual *">
              <input type="password" value={senhaAtual} autoFocus
                onChange={e => setSenhaAtual(e.target.value)}
                required style={inputStyle} />
            </Campo>
            <Campo label="Nova senha *">
              <input type="password" value={senhaNova}
                onChange={e => setSenhaNova(e.target.value)}
                required minLength={6} style={inputStyle}
                placeholder="Mínimo 6 caracteres" />
            </Campo>
            <Campo label="Confirmar nova senha *">
              <input type="password" value={confirmar}
                onChange={e => setConfirmar(e.target.value)}
                required style={inputStyle} />
            </Campo>

            {erro && (
              <div style={{
                marginTop: 8, padding: "10px 12px", borderRadius: 8,
                background: C.red + "22", border: `1px solid ${C.red}55`,
                color: C.red, fontSize: 13,
              }}>{erro}</div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
              <button type="button" onClick={onFechar} disabled={salvando} style={btnSecundario}>
                Cancelar
              </button>
              <button type="submit" disabled={salvando} style={btnPrimario}>
                {salvando ? "Salvando..." : "Trocar senha"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: "block", color: C.muted, fontSize: 12, marginBottom: 6, fontWeight: 600,
      }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14,
  outline: "none", boxSizing: "border-box",
};

const modalOverlay = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 20, zIndex: 100,
};

const modalCard = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
  width: "100%", maxWidth: 420, padding: 24,
};

const modalHeader = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  marginBottom: 18,
};

const btnFechar = {
  background: "transparent", border: "none", color: C.muted,
  fontSize: 22, cursor: "pointer",
};

const btnSecundario = {
  background: C.surface, border: `1px solid ${C.border}`, color: C.text,
  borderRadius: 8, padding: "10px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer",
};

const btnPrimario = {
  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
  color: C.white, border: "none", borderRadius: 8,
  padding: "10px 22px", fontWeight: 700, fontSize: 13, cursor: "pointer",
};
