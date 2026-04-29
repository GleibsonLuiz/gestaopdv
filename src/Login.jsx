import { useState } from "react";
import { api, setSession } from "./lib/api.js";

const C = {
  bg: "#0f1117", surface: "#1a1d27", card: "#21253a",
  border: "#2e3354", accent: "#4f8ef7", text: "#e2e8f0",
  muted: "#64748b", white: "#ffffff", red: "#ef4444", purple: "#7c3aed",
};

export default function Login({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const { token, user } = await api.login(email, senha);
      setSession(token, user);
      onSuccess(user);
    } catch (err) {
      setErro(err.message || "Falha ao entrar");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={{
      background: C.bg, minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 20,
      fontFamily: "'Segoe UI', sans-serif", color: C.text,
    }}>
      <form onSubmit={entrar} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: 32, width: "100%", maxWidth: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40 }}>🏪</div>
          <div style={{ color: C.white, fontWeight: 800, fontSize: 22, marginTop: 8 }}>GestãoPRO</div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Faça login para continuar</div>
        </div>

        <label style={labelStyle}>Email</label>
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          required autoFocus style={inputStyle}
        />

        <label style={{ ...labelStyle, marginTop: 14 }}>Senha</label>
        <input
          type="password" value={senha} onChange={e => setSenha(e.target.value)}
          required style={inputStyle}
        />

        {erro && (
          <div style={{
            marginTop: 14, padding: "10px 12px", borderRadius: 8,
            background: C.red + "22", border: `1px solid ${C.red}55`,
            color: C.red, fontSize: 13,
          }}>
            {erro}
          </div>
        )}

        <button type="submit" disabled={carregando} style={{
          marginTop: 20, width: "100%", padding: "12px", borderRadius: 10, border: "none",
          background: carregando ? C.muted : `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
          color: C.white, fontWeight: 700, fontSize: 14,
          cursor: carregando ? "default" : "pointer",
        }}>
          {carregando ? "Entrando..." : "Entrar"}
        </button>

        <div style={{ marginTop: 16, color: C.muted, fontSize: 11, textAlign: "center" }}>
          Backend em http://localhost:3333
        </div>
      </form>
    </div>
  );
}

const labelStyle = { display: "block", color: C.muted, fontSize: 12, marginBottom: 6, fontWeight: 600 };
const inputStyle = {
  width: "100%", background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14,
  outline: "none", boxSizing: "border-box",
};
