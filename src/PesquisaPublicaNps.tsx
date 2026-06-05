import { useEffect, useState, type ReactNode } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";
import { fmtData } from "./lib/format";


interface VendaInfo {
  numero: string | number;
  data: string;
}

interface DadosPesquisa {
  empresa: string;
  cliente?: string;
  venda?: VendaInfo;
  respondida?: boolean;
  nota?: number;
}

interface PesquisaPublicaNpsProps {
  token: string;
}

// ============ COMPONENTE PRINCIPAL ============

export default function PesquisaPublicaNps({ token }: PesquisaPublicaNpsProps) {
  const [dados, setDados] = useState<DadosPesquisa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    api.obterPesquisaNpsPublica(token)
      .then((raw) => {
        const d = raw as DadosPesquisa;
        setDados(d);
        if (d.respondida) setEnviado(true);
      })
      .catch((e: Error) => setErro(e.message || "Pesquisa não encontrada"))
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
      setErro((e as Error).message || "Erro ao enviar");
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) {
    return (
      <Container>
        <div className="text-gp-muted p-10 text-center">Carregando pesquisa...</div>
      </Container>
    );
  }

  if (erro && !dados) {
    return (
      <Container>
        <div className="text-center p-[30px]">
          <div className="text-[48px] mb-3">🔗</div>
          <div className="text-gp-white text-lg font-bold mb-[6px]">
            Link inválido ou expirado
          </div>
          <div className="text-gp-muted text-[13px]">{erro}</div>
        </div>
      </Container>
    );
  }

  if (enviado) {
    return (
      <Container>
        <div className="text-center p-[30px]">
          <div className="text-[56px] mb-3">🎉</div>
          <div className="text-gp-white text-[22px] font-extrabold mb-2">
            Obrigado pelo seu feedback!
          </div>
          <div className="text-gp-muted text-sm max-w-[360px] mx-auto">
            Sua opinião nos ajuda a melhorar a cada dia. Foi um prazer atender você!
          </div>
          {dados?.nota != null && (
            <div className="mt-6 text-gp-accent text-[13px]">
              Sua nota: <strong>{dados.nota}/10</strong>
            </div>
          )}
        </div>
      </Container>
    );
  }

  if (!dados) return null;

  return (
    <Container>
      {/* Header */}
      <div className="text-center mb-6">
        <div className="text-gp-muted text-[11px] uppercase tracking-[1px] font-bold">
          {dados.empresa}
        </div>
        <h1 className="text-gp-white text-[22px] font-extrabold mt-2 mb-1">
          Como foi sua experiência?
        </h1>
        {dados.cliente && (
          <div className="text-gp-text text-[13px]">
            Olá <strong>{primeiroNome(dados.cliente)}</strong>!
          </div>
        )}
        {dados.venda && (
          <div className="text-gp-muted text-xs mt-1">
            Sobre a compra #{dados.venda.numero} de {fmtData(dados.venda.data)}
          </div>
        )}
      </div>

      <div className="text-gp-text text-sm mb-3 text-center">
        Em uma escala de <strong>0 a 10</strong>, qual a chance de você nos recomendar a um amigo?
      </div>

      {/* Escala 0-10 */}
      <div
        className="grid gap-1 mb-2"
        style={{ gridTemplateColumns: "repeat(11, 1fr)" }}
      >
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            onClick={() => setNota(i)}
            className="rounded-lg text-sm font-extrabold cursor-pointer transition-all p-0"
            style={{
              aspectRatio: "1 / 1",
              background: nota === i ? corNota(i) : C.card,
              color: nota === i ? C.white : C.text,
              border: `2px solid ${nota === i ? corNota(i) : C.border}`,
            }}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-gp-muted text-[10px] mb-[18px]">
        <span>👎 Pouco provável</span>
        <span>👍 Muito provável</span>
      </div>

      {/* Categoria escolhida */}
      {nota != null && (
        <div
          className="rounded-lg px-[14px] py-[10px] mb-[14px] text-center"
          style={{
            background: corNota(nota) + "22",
            border: `1px solid ${corNota(nota)}55`,
          }}
        >
          <div
            className="text-xs font-extrabold uppercase tracking-[0.5px]"
            style={{ color: corNota(nota) }}
          >
            {textoNota(nota)}
          </div>
        </div>
      )}

      {/* Comentário */}
      <div className="mb-[14px]">
        <div className="text-gp-muted text-[11px] uppercase tracking-[0.5px] mb-[6px] font-semibold">
          Quer nos contar mais? (opcional)
        </div>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value.slice(0, 1000))}
          rows={4}
          maxLength={1000}
          placeholder="Conte como podemos melhorar ou o que mais gostou..."
          className="w-full box-border bg-gp-bg text-gp-text rounded-lg p-3 text-[13px] resize-y outline-none min-h-[80px]"
          style={{ border: `1px solid ${C.border}`, fontFamily: "inherit" }}
        />
        <div className="text-gp-muted text-[10px] text-right mt-[2px]">
          {comentario.length}/1000
        </div>
      </div>

      {erro && (
        <div
          className="px-3 py-2 rounded text-xs mb-3 text-gp-red"
          style={{ background: C.red + "22" }}
        >
          {erro}
        </div>
      )}

      <button
        onClick={enviar}
        disabled={nota == null || enviando}
        className="w-full text-gp-white border-none px-5 py-3 rounded-lg text-sm font-extrabold"
        style={{
          background: nota != null ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : C.muted + "55",
          cursor: nota != null && !enviando ? "pointer" : "not-allowed",
          boxShadow: nota != null ? `0 6px 18px ${C.accent}33` : "none",
        }}
      >
        {enviando ? "Enviando..." : "Enviar resposta"}
      </button>

      <div className="text-gp-muted text-[10px] text-center mt-[14px]">
        Sua resposta é confidencial e usada apenas para melhorar nosso atendimento.
      </div>
    </Container>
  );
}

// ============ HELPERS ============

function primeiroNome(nomeCompleto: string | null | undefined): string {
  return String(nomeCompleto || "").trim().split(/\s+/)[0] || "";
}

function corNota(n: number): string {
  if (n >= 9) return C.green;
  if (n >= 7) return C.yellow;
  return C.red;
}

function textoNota(n: number): string {
  if (n >= 9) return "⭐ Promotor — Você é fã!";
  if (n >= 7) return "👍 Neutro — Vamos melhorar";
  return "💔 Detrator — Vamos ouvir você";
}

function Container({ children }: { children: ReactNode }) {
  return (
    <div
      className="bg-gp-bg min-h-screen flex items-center justify-center p-4"
      style={{ fontFamily: "'Segoe UI', sans-serif" }}
    >
      <div
        className="bg-gp-surface rounded-2xl p-7 w-full max-w-[480px]"
        style={{
          border: `1px solid ${C.border}`,
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
