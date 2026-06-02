// CardapioPublico.tsx — pagina PUBLICA de pedido online (cardapio digital).
// Acessada por /?cardapio=<token>, sem login. O cliente final monta o pedido
// e envia; vira uma Comanda (DELIVERY/VIAGEM) na Central de Comandas da loja.
// Design proprio (claro, mobile-first) — independente do tema do app.

import { useEffect, useMemo, useState } from "react";
import { api } from "./lib/api";

const brl = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface ItemMenu { id: string; nome: string; preco: number; }
interface CategoriaMenu { nome: string; itens: ItemMenu[]; }
interface Cardapio { empresa: { nome: string }; categorias: CategoriaMenu[]; }

export default function CardapioPublico({ token }: { token: string }) {
  const [cardapio, setCardapio] = useState<Cardapio | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
  const [checkout, setCheckout] = useState(false);

  // Form
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [tipo, setTipo] = useState<"DELIVERY" | "VIAGEM">("DELIVERY");
  const [endereco, setEndereco] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState<{ numero: number; total: number } | null>(null);

  useEffect(() => {
    api.cardapioPublicoObter(token)
      .then((d) => setCardapio(d as Cardapio))
      .catch((e) => setErro((e as Error).message || "Cardápio indisponível"))
      .finally(() => setCarregando(false));
  }, [token]);

  const produtos = useMemo(() => {
    const m = new Map<string, ItemMenu>();
    cardapio?.categorias.forEach(c => c.itens.forEach(i => m.set(i.id, i)));
    return m;
  }, [cardapio]);

  const itensCarrinho = Object.entries(carrinho).filter(([, q]) => q > 0);
  const total = itensCarrinho.reduce((s, [id, q]) => s + (produtos.get(id)?.preco || 0) * q, 0);
  const qtdTotal = itensCarrinho.reduce((s, [, q]) => s + q, 0);

  function add(id: string, delta: number) {
    setCarrinho(prev => {
      const novo = { ...prev };
      novo[id] = Math.max(0, (novo[id] || 0) + delta);
      if (novo[id] === 0) delete novo[id];
      return novo;
    });
  }

  async function enviar() {
    setErro("");
    if (!nome.trim()) return setErro("Informe seu nome");
    if (!telefone.trim()) return setErro("Informe um telefone");
    if (tipo === "DELIVERY" && !endereco.trim()) return setErro("Informe o endereço de entrega");
    setEnviando(true);
    try {
      const itens = itensCarrinho.map(([produtoId, quantidade]) => ({ produtoId, quantidade }));
      const r = await api.cardapioPublicoPedido(token, {
        nome, telefone, tipo, endereco: tipo === "DELIVERY" ? endereco : "", observacoes: obs, itens,
      }) as { numero: number; total: number };
      setSucesso({ numero: r.numero, total: r.total });
    } catch (e) {
      setErro((e as Error).message || "Não foi possível enviar o pedido");
    } finally {
      setEnviando(false);
    }
  }

  // ---- estilos (claro, mobile-first) ----
  const page: React.CSSProperties = { minHeight: "100vh", background: "#f4f4f5", color: "#18181b", fontFamily: "system-ui, sans-serif", paddingBottom: 110 };
  const wrap: React.CSSProperties = { maxWidth: 560, margin: "0 auto", padding: 16 };
  const card: React.CSSProperties = { background: "#fff", borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,.08)" };

  if (carregando) return <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center" }}>Carregando cardápio…</div>;
  if (erro && !cardapio) return (
    <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <div><div style={{ fontSize: 40 }}>🍽️</div><div style={{ marginTop: 8, color: "#71717a" }}>{erro}</div></div>
    </div>
  );

  if (sucesso) return (
    <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <div style={card}>
        <div style={{ fontSize: 48 }}>✅</div>
        <h2 style={{ margin: "10px 0 4px" }}>Pedido enviado!</h2>
        <p style={{ color: "#71717a", margin: 0 }}>Seu pedido <strong>#{sucesso.numero}</strong> foi recebido pela loja.</p>
        <p style={{ fontSize: 22, fontWeight: 800, marginTop: 12 }}>{brl(sucesso.total)}</p>
        <p style={{ color: "#71717a", fontSize: 13 }}>Em breve a loja entra em contato pelo telefone informado.</p>
      </div>
    </div>
  );

  return (
    <div style={page}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)", color: "#fff", padding: "22px 16px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ fontSize: 12, opacity: .85 }}>🍔 Cardápio digital</div>
          <h1 style={{ margin: "2px 0 0", fontSize: 22 }}>{cardapio?.empresa.nome}</h1>
        </div>
      </div>

      <div style={wrap}>
        {!checkout ? (
          <>
            {cardapio?.categorias.length === 0 && (
              <div style={{ ...card, textAlign: "center", color: "#71717a" }}>Nenhum produto disponível no momento.</div>
            )}
            {cardapio?.categorias.map(cat => (
              <div key={cat.nome} style={card}>
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>{cat.nome}</div>
                {cat.itens.map(it => {
                  const q = carrinho[it.id] || 0;
                  return (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #f1f1f3" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{it.nome}</div>
                        <div style={{ color: "#4f46e5", fontWeight: 700, fontSize: 13 }}>{brl(it.preco)}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {q > 0 && <button onClick={() => add(it.id, -1)} style={btnQ}>−</button>}
                        {q > 0 && <span style={{ minWidth: 18, textAlign: "center", fontWeight: 700 }}>{q}</span>}
                        <button onClick={() => add(it.id, 1)} style={{ ...btnQ, background: "#4f46e5", color: "#fff", borderColor: "#4f46e5" }}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        ) : (
          /* Checkout */
          <div style={card}>
            <button onClick={() => setCheckout(false)} style={{ background: "none", border: "none", color: "#4f46e5", fontWeight: 700, cursor: "pointer", padding: 0, marginBottom: 10 }}>← Voltar ao cardápio</button>
            <h3 style={{ margin: "0 0 12px" }}>Seus dados</h3>
            <Campo label="Nome *"><input value={nome} onChange={e => setNome(e.target.value)} style={inp} /></Campo>
            <Campo label="Telefone (WhatsApp) *"><input value={telefone} onChange={e => setTelefone(e.target.value)} inputMode="tel" style={inp} /></Campo>
            <Campo label="Tipo">
              <div style={{ display: "flex", gap: 8 }}>
                {(["DELIVERY", "VIAGEM"] as const).map(t => (
                  <button key={t} onClick={() => setTipo(t)} style={{ ...chip, ...(tipo === t ? chipOn : {}) }}>
                    {t === "DELIVERY" ? "🛵 Entrega" : "🏃 Retirada"}
                  </button>
                ))}
              </div>
            </Campo>
            {tipo === "DELIVERY" && (
              <Campo label="Endereço de entrega *"><input value={endereco} onChange={e => setEndereco(e.target.value)} style={inp} placeholder="Rua, número, bairro, referência" /></Campo>
            )}
            <Campo label="Observações"><textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} placeholder="Ex: sem cebola, troco para R$ 50" /></Campo>
            {erro && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 6 }}>{erro}</div>}
          </div>
        )}
      </div>

      {/* Barra de carrinho fixa */}
      {qtdTotal > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e4e4e7", padding: 12, boxShadow: "0 -2px 10px rgba(0,0,0,.06)" }}>
          <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#71717a" }}>{qtdTotal} item(ns)</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{brl(total)}</div>
            </div>
            {!checkout ? (
              <button onClick={() => setCheckout(true)} style={btnCta}>Continuar →</button>
            ) : (
              <button onClick={enviar} disabled={enviando} style={{ ...btnCta, opacity: enviando ? .6 : 1 }}>{enviando ? "Enviando…" : "Enviar pedido"}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#52525b", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid #d4d4d8", fontSize: 15, outline: "none" };
const btnQ: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: "1px solid #d4d4d8", background: "#fff", fontSize: 18, fontWeight: 700, cursor: "pointer", lineHeight: 1, color: "#18181b" };
const btnCta: React.CSSProperties = { background: "#4f46e5", color: "#fff", border: "none", borderRadius: 10, padding: "12px 20px", fontWeight: 800, fontSize: 15, cursor: "pointer", whiteSpace: "nowrap" };
const chip: React.CSSProperties = { flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #d4d4d8", background: "#fff", fontWeight: 700, cursor: "pointer", color: "#18181b" };
const chipOn: React.CSSProperties = { background: "#eef2ff", borderColor: "#4f46e5", color: "#4f46e5" };
