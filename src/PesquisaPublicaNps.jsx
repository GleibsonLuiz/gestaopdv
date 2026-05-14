import { useEffect, useState } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";

const fmtData = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR");
};

// ============ COMPONENTE PRINCIPAL ============

export default function PesquisaPublicaNps({ token }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [nota, setNota] = useState(null);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    api.obterPesquisaNpsPublica(token)
      .then((d) => {
        setDados(d);
        if (d.respondida) setEnviado(true);
      })
      .catch((e) => setErro(e.message || "Pesquisa não encontrada"))
      .finally(() => setCarregando(false));
  }, [token]);

  async function enviar() {
    if (nota == null) return;
    setEnviando(true);
    setErro("");
    try {
      await api.responderPesquisaNps(token, { nota, comentario: comentario.trim() || undefined });
      setEnviado(true);
    } catch (e) {
      setErro(e.message || "Erro ao enviar");
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) {
    return (
      <Container>
        <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Carregando pesquisa...</div>
      </Container>
    );
  }

  if (erro && !dados) {
    return (
      <Container>
        <div style={{ textAlign: "center", padding: 30 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔗</div>
          <div style={{ color: C.white, fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
            Link inválido ou expirado
          </div>
          <div style={{ color: C.muted, fontSize: 13 }}>
            {erro}
          </div>
        </div>
      </Container>
    );
  }

  if (enviado) {
    return (
      <Container>
        <div style={{ textAlign: "center", padding: 30 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
          <div style={{ color: C.white, fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
            Obrigado pelo seu feedback!
          </div>
          <div style={{ color: C.muted, fontSize: 14, maxWidth: 360, margin: "0 auto" }}>
            Sua opinião nos ajuda a melhorar a cada dia. Foi um prazer atender você!
          </div>
          {dados?.nota != null && (
            <div style={{ marginTop: 24, color: C.accent, fontSize: 13 }}>
              Sua nota: <strong>{dados.nota}/10</strong>
            </div>
          )}
        </div>
      </Container>
    );
  }

  return (
    <Container>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>
          {dados.empresa}
        </div>
        <h1 style={{ color: C.white, fontSize: 22, fontWeight: 800, margin: "8px 0 4px" }}>
          Como foi sua experiência?
        </h1>
        {dados.cliente && (
          <div style={{ color: C.text, fontSize: 13 }}>
            Olá <strong>{primeiroNome(dados.cliente)}</strong>!
          </div>
        )}
        {dados.venda && (
          <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
            Sobre a compra #{dados.venda.numero} de {fmtData(dados.venda.data)}
          </div>
        )}
      </div>

      <div style={{ color: C.text, fontSize: 14, marginBottom: 12, textAlign: "center" }}>
        Em uma escala de <strong>0 a 10</strong>, qual a chance de você nos recomendar a um amigo?
      </div>

      {/* Escala 0-10 */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(11, 1fr)",
        gap: 4, marginBottom: 8,
      }}>
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            onClick={() => setNota(i)}
            style={{
              aspectRatio: "1 / 1",
              background: nota === i ? corNota(i) : C.card,
              color: nota === i ? C.white : C.text,
              border: `2px solid ${nota === i ? corNota(i) : C.border}`,
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              transition: "all 0.15s ease",
              padding: 0,
            }}
          >{i}</button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", color: C.muted, fontSize: 10, marginBottom: 18 }}>
        <span>👎 Pouco provável</span>
        <span>👍 Muito provável</span>
      </div>

      {/* Categoria escolhida */}
      {nota != null && (
        <div style={{
          background: corNota(nota) + "22",
          border: `1px solid ${corNota(nota)}55`,
          borderRadius: 8, padding: "10px 14px", marginBottom: 14,
          textAlign: "center",
        }}>
          <div style={{ color: corNota(nota), fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {textoNota(nota)}
          </div>
        </div>
      )}

      {/* Comentário */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: 600 }}>
          Quer nos contar mais? (opcional)
        </div>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value.slice(0, 1000))}
          rows={4}
          maxLength={1000}
          placeholder="Conte como podemos melhorar ou o que mais gostou..."
          style={{
            width: "100%", boxSizing: "border-box",
            background: C.bg, color: C.text, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: 12, fontSize: 13, fontFamily: "inherit",
            resize: "vertical", outline: "none", minHeight: 80,
          }}
        />
        <div style={{ color: C.muted, fontSize: 10, textAlign: "right", marginTop: 2 }}>
          {comentario.length}/1000
        </div>
      </div>

      {erro && (
        <div style={{ background: C.red + "22", color: C.red, padding: "8px 12px", borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
          {erro}
        </div>
      )}

      <button
        onClick={enviar}
        disabled={nota == null || enviando}
        style={{
          width: "100%",
          background: nota != null ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : C.muted + "55",
          color: C.white, border: "none", padding: "12px 20px",
          borderRadius: 8, fontSize: 14, fontWeight: 800,
          cursor: nota != null && !enviando ? "pointer" : "not-allowed",
          boxShadow: nota != null ? `0 6px 18px ${C.accent}33` : "none",
        }}
      >
        {enviando ? "Enviando..." : "Enviar resposta"}
      </button>

      <div style={{ color: C.muted, fontSize: 10, textAlign: "center", marginTop: 14 }}>
        Sua resposta é confidencial e usada apenas para melhorar nosso atendimento.
      </div>
    </Container>
  );
}

// ============ HELPERS ============

function primeiroNome(nomeCompleto) {
  return String(nomeCompleto || "").trim().split(/\s+/)[0] || "";
}

function corNota(n) {
  if (n >= 9) return C.green;
  if (n >= 7) return C.yellow;
  return C.red;
}

function textoNota(n) {
  if (n >= 9) return "⭐ Promotor — Você é fã!";
  if (n >= 7) return "👍 Neutro — Vamos melhorar";
  return "💔 Detrator — Vamos ouvir você";
}

function Container({ children }) {
  return (
    <div style={{
      background: C.bg, minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, fontFamily: "'Segoe UI', sans-serif",
    }}>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 16, padding: 28,
        width: "100%", maxWidth: 480,
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
      }}>
        {children}
      </div>
    </div>
  );
}
