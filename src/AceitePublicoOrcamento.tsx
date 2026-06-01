import { useEffect, useState, type ReactNode } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";

const fmtBRL = (v: number | string | null | undefined): string =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR");
};

interface ItemOrc {
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  subtotal: number;
}

interface DadosOrcamento {
  token: string;
  numero: number;
  tipo: string;
  status: string;
  decidido: boolean;
  cliente?: string | null;
  responsavel?: string | null;
  observacoes?: string | null;
  formaCondicaoPagamento?: string | null;
  valorProdutos: number;
  valorServicos: number;
  deslocamento: number;
  desconto: number;
  total: number;
  imprimirValores: boolean;
  itens: ItemOrc[];
  criadoEm: string;
  empresa: string;
}

interface AceitePublicoOrcamentoProps {
  token: string;
}

// ============ COMPONENTE PRINCIPAL ============

export default function AceitePublicoOrcamento({ token }: AceitePublicoOrcamentoProps) {
  const [dados, setDados] = useState<DadosOrcamento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [decisaoFinal, setDecisaoFinal] = useState<string | null>(null);
  const [mostrarRecusa, setMostrarRecusa] = useState(false);
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    api.obterOrcamentoPublico(token)
      .then((raw) => {
        const d = raw as DadosOrcamento;
        setDados(d);
        if (d.decidido) setDecisaoFinal(d.status);
      })
      .catch((e: Error) => setErro(e.message || "Orçamento não encontrado"))
      .finally(() => setCarregando(false));
  }, [token]);

  async function responder(decisao: "APROVAR" | "RECUSAR") {
    setEnviando(true);
    setErro("");
    try {
      const r = (await api.responderOrcamentoPublico(token, {
        decisao,
        motivo: decisao === "RECUSAR" ? motivo.trim() || undefined : undefined,
      })) as { status: string };
      setDecisaoFinal(r.status);
    } catch (e) {
      setErro((e as Error).message || "Erro ao enviar resposta");
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) {
    return (
      <Container>
        <div className="text-gp-muted p-10 text-center">Carregando orçamento...</div>
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

  if (!dados) return null;

  // Tela de confirmação final (após responder ou se já estava decidido).
  if (decisaoFinal) {
    const aprovado = decisaoFinal === "APROVADO" || decisaoFinal === "ENTREGUE";
    const recusado = decisaoFinal === "REJEITADO";
    return (
      <Container>
        <div className="text-center p-[30px]">
          <div className="text-[56px] mb-3">{aprovado ? "✅" : recusado ? "📋" : "ℹ️"}</div>
          <div className="text-gp-white text-[22px] font-extrabold mb-2">
            {aprovado ? "Orçamento aprovado!" : recusado ? "Orçamento recusado" : "Orçamento já respondido"}
          </div>
          <div className="text-gp-muted text-sm max-w-[360px] mx-auto">
            {aprovado
              ? `Obrigado! Recebemos sua aprovação do orçamento #${dados.numero}. Em breve entraremos em contato para os próximos passos.`
              : recusado
                ? `Registramos que o orçamento #${dados.numero} não atende ao que você precisa no momento. Agradecemos o retorno!`
                : `Este orçamento (#${dados.numero}) já teve uma resposta registrada.`}
          </div>
        </div>
      </Container>
    );
  }

  const ehOS = dados.tipo === "ORDEM_SERVICO";

  return (
    <Container>
      {/* Header */}
      <div className="text-center mb-5">
        <div className="text-gp-muted text-[11px] uppercase tracking-[1px] font-bold">
          {dados.empresa}
        </div>
        <h1 className="text-gp-white text-[22px] font-extrabold mt-2 mb-1">
          {ehOS ? "Ordem de Serviço" : "Orçamento"} #{dados.numero}
        </h1>
        {dados.cliente && (
          <div className="text-gp-text text-[13px]">
            Para <strong>{dados.cliente}</strong>
          </div>
        )}
        <div className="text-gp-muted text-xs mt-1">
          Emitido em {fmtData(dados.criadoEm)}
          {dados.responsavel ? ` · ${dados.responsavel}` : ""}
        </div>
      </div>

      {/* Itens */}
      <div
        className="rounded-xl overflow-hidden mb-4"
        style={{ border: `1px solid ${C.border}` }}
      >
        {dados.itens.map((it, i) => (
          <div
            key={i}
            className="px-[14px] py-[10px] flex items-start justify-between gap-3"
            style={{
              borderBottom: i < dados.itens.length - 1 ? `1px solid ${C.border}` : "none",
              background: i % 2 === 0 ? "transparent" : C.card + "55",
            }}
          >
            <div className="min-w-0">
              <div className="text-gp-text text-[13px] font-semibold">{it.descricao}</div>
              {dados.imprimirValores && (
                <div className="text-gp-muted text-[11px] mt-[2px]">
                  {it.quantidade} × {fmtBRL(it.valorUnitario)}
                </div>
              )}
            </div>
            {dados.imprimirValores && (
              <div className="text-gp-text text-[13px] font-bold whitespace-nowrap">
                {fmtBRL(it.subtotal)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Totais */}
      {dados.imprimirValores && (
        <div className="flex flex-col gap-1 mb-4 text-[13px]">
          {dados.valorProdutos > 0 && <LinhaTotal label="Produtos" valor={dados.valorProdutos} />}
          {dados.valorServicos > 0 && <LinhaTotal label="Serviços" valor={dados.valorServicos} />}
          {dados.deslocamento > 0 && <LinhaTotal label="Deslocamento" valor={dados.deslocamento} />}
          {dados.desconto > 0 && <LinhaTotal label="Desconto" valor={-dados.desconto} cor={C.green} />}
          <div
            className="flex items-center justify-between pt-2 mt-1"
            style={{ borderTop: `1px solid ${C.border}` }}
          >
            <span className="text-gp-white font-bold text-base">Total</span>
            <span className="text-gp-white font-extrabold text-lg">{fmtBRL(dados.total)}</span>
          </div>
        </div>
      )}

      {/* Condições */}
      {(dados.formaCondicaoPagamento || dados.observacoes) && (
        <div
          className="rounded-lg px-[14px] py-3 mb-4 text-[12px] text-gp-muted"
          style={{ background: C.card + "66", border: `1px solid ${C.border}` }}
        >
          {dados.formaCondicaoPagamento && (
            <div className="mb-1">
              <strong className="text-gp-text">Pagamento:</strong> {dados.formaCondicaoPagamento}
            </div>
          )}
          {dados.observacoes && (
            <div className="whitespace-pre-wrap">{dados.observacoes}</div>
          )}
        </div>
      )}

      {erro && (
        <div
          className="px-3 py-2 rounded text-xs mb-3 text-gp-red"
          style={{ background: C.red + "22" }}
        >
          {erro}
        </div>
      )}

      {/* Recusa: campo de motivo */}
      {mostrarRecusa && (
        <div className="mb-3">
          <div className="text-gp-muted text-[11px] uppercase tracking-[0.5px] mb-[6px] font-semibold">
            Pode nos dizer o motivo? (opcional)
          </div>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value.slice(0, 500))}
            rows={3}
            maxLength={500}
            placeholder="Ex: preço acima do esperado, prazo, fechei com outro fornecedor..."
            className="w-full box-border bg-gp-bg text-gp-text rounded-lg p-3 text-[13px] resize-y outline-none min-h-[70px]"
            style={{ border: `1px solid ${C.border}`, fontFamily: "inherit" }}
          />
        </div>
      )}

      {/* Botões de ação */}
      {!mostrarRecusa ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMostrarRecusa(true)}
            disabled={enviando}
            className="flex-1 border-none px-4 py-3 rounded-lg text-sm font-bold cursor-pointer"
            style={{ background: C.card, color: C.text, border: `1px solid ${C.border}` }}
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={() => responder("APROVAR")}
            disabled={enviando}
            className="flex-[2] text-gp-white border-none px-5 py-3 rounded-lg text-sm font-extrabold cursor-pointer"
            style={{
              background: `linear-gradient(135deg, ${C.green}, ${C.accent})`,
              boxShadow: `0 6px 18px ${C.green}33`,
            }}
          >
            {enviando ? "Enviando..." : "✅ Aprovar orçamento"}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setMostrarRecusa(false); setMotivo(""); }}
            disabled={enviando}
            className="flex-1 border-none px-4 py-3 rounded-lg text-sm font-bold cursor-pointer"
            style={{ background: C.card, color: C.text, border: `1px solid ${C.border}` }}
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => responder("RECUSAR")}
            disabled={enviando}
            className="flex-[2] text-gp-white border-none px-5 py-3 rounded-lg text-sm font-extrabold cursor-pointer"
            style={{ background: C.red, boxShadow: `0 6px 18px ${C.red}33` }}
          >
            {enviando ? "Enviando..." : "Confirmar recusa"}
          </button>
        </div>
      )}

      <div className="text-gp-muted text-[10px] text-center mt-[14px]">
        Sua resposta é registrada com segurança e enviada diretamente à empresa.
      </div>
    </Container>
  );
}

// ============ HELPERS ============

function LinhaTotal({ label, valor, cor }: { label: string; valor: number; cor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gp-muted">{label}</span>
      <span style={{ color: cor || C.text }}>{fmtBRL(valor)}</span>
    </div>
  );
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
