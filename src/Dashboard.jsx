import { useCallback, useEffect, useMemo, useState } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";


const fmtBRL = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtNumero = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR");
};

const fmtData = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const fmtDiaCurto = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

const fmtDiaSemana = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").toUpperCase();
};

const fmtPercentual = (v) => {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return null;
  const sinal = v > 0 ? "+" : "";
  return `${sinal}${Number(v).toFixed(1)}%`;
};

const ROTULO_PAGAMENTO = {
  DINHEIRO: "Dinheiro",
  CARTAO_CREDITO: "Cartão de crédito",
  CARTAO_DEBITO: "Cartão de débito",
  PIX: "Pix",
  BOLETO: "Boleto",
  CREDIARIO: "Crediário",
};

export default function Dashboard({ user }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await api.obterDashboard();
      setDados(data);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (carregando && !dados) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>
        Carregando indicadores...
      </div>
    );
  }

  if (erro) {
    return (
      <div style={{
        padding: "12px 14px", borderRadius: 8,
        background: C.red + "22", border: `1px solid ${C.red}55`,
        color: C.red, fontSize: 13,
      }}>
        {erro}
        <button onClick={carregar} style={{
          marginLeft: 12, background: "transparent", border: `1px solid ${C.red}55`,
          color: C.red, borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer",
        }}>Tentar novamente</button>
      </div>
    );
  }

  if (!dados) return null;
  return <ConteudoDashboard dados={dados} onAtualizar={carregar} user={user} />;
}

function ConteudoDashboard({ dados, onAtualizar, user }) {
  const k = dados.kpis;

  const variacao = fmtPercentual(k.vendasMes.variacaoPercentual);
  const variacaoCor =
    k.vendasMes.variacaoPercentual === null ? C.muted :
    k.vendasMes.variacaoPercentual >= 0 ? C.green : C.red;

  const totalFormas = useMemo(
    () => (dados.formasPagamento || []).reduce((a, f) => a + Number(f.total || 0), 0),
    [dados.formasPagamento]
  );

  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 16, gap: 10, flexWrap: "wrap",
      }}>
        <div style={{ color: C.muted, fontSize: 12 }}>
          Olá, <span style={{ color: C.white, fontWeight: 600 }}>{user?.nome || "—"}</span>.
          Atualizado em <span style={{ color: C.text }}>{fmtData(dados.geradoEm)}</span>
        </div>
        <button onClick={onAtualizar} style={{
          background: C.surface, border: `1px solid ${C.border}`, color: C.text,
          borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>↻ Atualizar</button>
      </div>

      {/* KPIs principais */}
      <div style={{
        display: "grid", gap: 12, marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      }}>
        <CardKpi
          icone="🛒"
          rotulo="Vendas hoje"
          valor={fmtBRL(k.vendasHoje.total)}
          detalhe={`${fmtNumero(k.vendasHoje.quantidade)} ${k.vendasHoje.quantidade === 1 ? "venda" : "vendas"}`}
          cor={C.accent}
        />
        <CardKpi
          icone="💰"
          rotulo="Faturamento do mês"
          valor={fmtBRL(k.vendasMes.total)}
          detalhe={
            <span>
              {fmtNumero(k.vendasMes.quantidade)} vendas
              {variacao && (
                <span style={{ marginLeft: 8, color: variacaoCor, fontWeight: 700 }}>
                  {variacao} vs. mês anterior
                </span>
              )}
            </span>
          }
          cor={C.green}
        />
        <CardKpi
          icone="🎯"
          rotulo="Ticket médio (mês)"
          valor={fmtBRL(k.ticketMedioMes)}
          detalhe="Média por venda concluída"
          cor={C.purple}
        />
        <CardKpi
          icone="🛍️"
          rotulo="Compras do mês"
          valor={fmtBRL(k.comprasMes.total)}
          detalhe={`${fmtNumero(k.comprasMes.quantidade)} ${k.comprasMes.quantidade === 1 ? "compra" : "compras"}`}
          cor={C.yellow}
        />
      </div>

      {/* KPIs secundários (cadastros) */}
      <div style={{
        display: "grid", gap: 10, marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
      }}>
        <MiniCard icone="👥" rotulo="Clientes" valor={fmtNumero(k.clientesAtivos)} cor={C.accent} />
        <MiniCard icone="📦" rotulo="Produtos" valor={fmtNumero(k.produtosAtivos)} cor={C.green} />
        <MiniCard icone="🏭" rotulo="Fornecedores" valor={fmtNumero(k.fornecedoresAtivos)} cor={C.purple} />
        <MiniCard icone="🧑‍💼" rotulo="Funcionários" valor={fmtNumero(k.funcionariosAtivos)} cor={C.muted} />
        <MiniCard
          icone="⚠"
          rotulo="Estoque baixo"
          valor={fmtNumero(k.produtosEstoqueBaixo)}
          cor={k.produtosEstoqueBaixo > 0 ? C.yellow : C.muted}
          destaque={k.produtosEstoqueBaixo > 0}
        />
      </div>

      {/* Vendas dos últimos 7 dias + Top produtos */}
      <div style={{
        display: "grid", gap: 14, marginBottom: 18,
        gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
      }}>
        <PainelVendasSemana dados={dados.vendasPorDia} />
        <PainelTopProdutos itens={dados.topProdutos} />
      </div>

      {/* Top vendedores + Formas de pagamento */}
      <div style={{
        display: "grid", gap: 14, marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
      }}>
        <PainelTopVendedores itens={dados.topVendedores} />
        <PainelFormasPagamento itens={dados.formasPagamento} totalGeral={totalFormas} />
      </div>

      {/* Financeiro pendente + Estoque baixo */}
      <div style={{
        display: "grid", gap: 14, marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
      }}>
        <PainelFinanceiro
          titulo="Contas a pagar pendentes"
          icone="📤"
          dados={k.contasPagarPendentes}
          cor={C.red}
        />
        <PainelFinanceiro
          titulo="Contas a receber pendentes"
          icone="📥"
          dados={k.contasReceberPendentes}
          cor={C.green}
        />
      </div>

      <div style={{
        display: "grid", gap: 14, marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
      }}>
        <PainelEstoqueBaixo itens={dados.estoqueBaixo} />
        <PainelUltimasVendas itens={dados.ultimasVendas} />
      </div>

      <PainelUltimasCompras itens={dados.ultimasCompras} />
    </div>
  );
}

// ====== Componentes ======

function CardKpi({ icone, rotulo, valor, detalhe, cor }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: "16px 18px", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: cor,
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 18 }}>{icone}</div>
        <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>
          {rotulo}
        </div>
      </div>
      <div style={{ color: C.white, fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>{valor}</div>
      <div style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>{detalhe}</div>
    </div>
  );
}

function MiniCard({ icone, rotulo, valor, cor, destaque }) {
  return (
    <div style={{
      background: destaque ? cor + "11" : C.card,
      border: `1px solid ${destaque ? cor + "55" : C.border}`,
      borderRadius: 10, padding: "12px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 14 }}>{icone}</span>
        <span style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {rotulo}
        </span>
      </div>
      <div style={{ color: destaque ? cor : C.white, fontSize: 20, fontWeight: 800 }}>{valor}</div>
    </div>
  );
}

function Painel({ titulo, acessorio, children }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: "16px 18px",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 14, gap: 8,
      }}>
        <div style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>{titulo}</div>
        {acessorio}
      </div>
      {children}
    </div>
  );
}

function PainelVendasSemana({ dados }) {
  const max = Math.max(1, ...dados.map(d => Number(d.total) || 0));
  const totalSemana = dados.reduce((a, d) => a + (Number(d.total) || 0), 0);

  return (
    <Painel
      titulo="Vendas dos últimos 7 dias"
      acessorio={
        <span style={{ color: C.green, fontSize: 13, fontWeight: 700 }}>
          {fmtBRL(totalSemana)}
        </span>
      }
    >
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${dados.length}, 1fr)`,
        gap: 10, alignItems: "end", height: 180, marginBottom: 8,
      }}>
        {dados.map((d) => {
          const altura = max > 0 ? Math.max(4, Math.round((Number(d.total) || 0) / max * 160)) : 4;
          const ehMaior = Number(d.total) === max && max > 0;
          return (
            <div key={d.dia} style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "flex-end", height: "100%", gap: 4,
            }}>
              <div style={{
                color: ehMaior ? C.green : C.muted, fontSize: 10, fontWeight: 700,
                whiteSpace: "nowrap",
              }}>
                {Number(d.total) > 0 ? fmtBRL(d.total).replace("R$", "").trim() : ""}
              </div>
              <div title={`${fmtDiaCurto(d.dia)} — ${d.qtd} vendas — ${fmtBRL(d.total)}`}
                style={{
                  width: "100%", maxWidth: 36, height: altura,
                  background: ehMaior
                    ? `linear-gradient(180deg, ${C.green}, ${C.accent})`
                    : `linear-gradient(180deg, ${C.accent}, ${C.purple})`,
                  borderRadius: "6px 6px 2px 2px",
                  opacity: Number(d.total) > 0 ? 1 : 0.25,
                  transition: "opacity .2s",
                }} />
            </div>
          );
        })}
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${dados.length}, 1fr)`, gap: 10,
        borderTop: `1px solid ${C.border}`, paddingTop: 10,
      }}>
        {dados.map(d => (
          <div key={d.dia + "-l"} style={{ textAlign: "center" }}>
            <div style={{ color: C.muted, fontSize: 10, fontWeight: 700 }}>{fmtDiaSemana(d.dia)}</div>
            <div style={{ color: C.text, fontSize: 11 }}>{fmtDiaCurto(d.dia)}</div>
            <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>{d.qtd} vd</div>
          </div>
        ))}
      </div>
    </Painel>
  );
}

function PainelTopProdutos({ itens }) {
  return (
    <Painel titulo="Top 5 produtos do mês">
      {itens.length === 0 ? (
        <Vazio texto="Nenhum produto vendido no mês." />
      ) : itens.map((t, idx) => (
        <div key={(t.produto?.id || idx) + "-tp"} style={{
          display: "grid", gridTemplateColumns: "32px 1fr auto",
          alignItems: "center", padding: "8px 0",
          borderBottom: idx < itens.length - 1 ? `1px solid ${C.border}` : "none",
          gap: 10,
        }}>
          <div style={{
            background: idx === 0 ? C.yellow + "33" : C.surface,
            color: idx === 0 ? C.yellow : C.muted,
            border: `1px solid ${idx === 0 ? C.yellow + "55" : C.border}`,
            borderRadius: 6, padding: "4px 0", textAlign: "center",
            fontSize: 12, fontWeight: 800,
          }}>
            #{idx + 1}
          </div>
          <div>
            <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>
              {t.produto?.nome || "—"}
            </div>
            <div style={{ color: C.muted, fontSize: 11, fontFamily: "monospace" }}>
              {t.produto?.codigo || "—"} · {t.quantidade} {t.produto?.unidade || "UN"}
            </div>
          </div>
          <div style={{ color: C.green, fontSize: 13, fontWeight: 700 }}>
            {fmtBRL(t.total)}
          </div>
        </div>
      ))}
    </Painel>
  );
}

function PainelTopVendedores({ itens }) {
  const total = itens.reduce((a, t) => a + (Number(t.total) || 0), 0);
  return (
    <Painel titulo="Top vendedores do mês">
      {itens.length === 0 ? (
        <Vazio texto="Nenhuma venda registrada no mês." />
      ) : itens.map((t, idx) => {
        const pct = total > 0 ? (Number(t.total) / total) * 100 : 0;
        return (
          <div key={(t.user?.id || idx) + "-tv"} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <div>
                <span style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>
                  {t.user?.nome || "—"}
                </span>
                <span style={{
                  marginLeft: 8, color: C.muted, fontSize: 10, fontWeight: 700,
                  border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 6px",
                }}>
                  {t.user?.role || "—"}
                </span>
              </div>
              <div style={{ color: C.green, fontSize: 13, fontWeight: 700 }}>{fmtBRL(t.total)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                flex: 1, height: 6, background: C.surface, borderRadius: 3, overflow: "hidden",
              }}>
                <div style={{
                  width: `${pct}%`, height: "100%",
                  background: `linear-gradient(90deg, ${C.accent}, ${C.purple})`,
                }} />
              </div>
              <div style={{ color: C.muted, fontSize: 11, minWidth: 90, textAlign: "right" }}>
                {t.vendas} venda{t.vendas === 1 ? "" : "s"} · {pct.toFixed(0)}%
              </div>
            </div>
          </div>
        );
      })}
    </Painel>
  );
}

function PainelFormasPagamento({ itens, totalGeral }) {
  const cores = [C.accent, C.green, C.purple, C.yellow, C.red, C.muted];
  const ordenados = [...itens].sort((a, b) => Number(b.total) - Number(a.total));
  return (
    <Painel
      titulo="Formas de pagamento (mês)"
      acessorio={
        <span style={{ color: C.muted, fontSize: 12 }}>{fmtBRL(totalGeral)}</span>
      }
    >
      {ordenados.length === 0 ? (
        <Vazio texto="Nenhuma venda no mês." />
      ) : ordenados.map((f, idx) => {
        const pct = totalGeral > 0 ? (Number(f.total) / totalGeral) * 100 : 0;
        const cor = cores[idx % cores.length];
        return (
          <div key={f.formaPagamento} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>
                {ROTULO_PAGAMENTO[f.formaPagamento] || f.formaPagamento}
              </span>
              <span style={{ color: C.text, fontSize: 12 }}>
                {fmtBRL(f.total)} <span style={{ color: C.muted }}>· {pct.toFixed(0)}%</span>
              </span>
            </div>
            <div style={{
              height: 6, background: C.surface, borderRadius: 3, overflow: "hidden",
            }}>
              <div style={{ width: `${pct}%`, height: "100%", background: cor }} />
            </div>
            <div style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>
              {f.quantidade} venda{f.quantidade === 1 ? "" : "s"}
            </div>
          </div>
        );
      })}
    </Painel>
  );
}

function PainelFinanceiro({ titulo, icone, dados, cor }) {
  return (
    <Painel titulo={<span><span style={{ marginRight: 6 }}>{icone}</span>{titulo}</span>}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
        <div>
          <div style={{ color: C.muted, fontSize: 11 }}>Total pendente</div>
          <div style={{ color: cor, fontSize: 22, fontWeight: 800 }}>{fmtBRL(dados.total)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: C.muted, fontSize: 11 }}>Contas</div>
          <div style={{ color: C.text, fontSize: 18, fontWeight: 700 }}>{dados.quantidade}</div>
        </div>
      </div>
      {dados.atrasadas > 0 ? (
        <div style={{
          background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red,
          padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
        }}>
          ⚠ {dados.atrasadas} {dados.atrasadas === 1 ? "conta atrasada" : "contas atrasadas"}
        </div>
      ) : (
        <div style={{
          background: C.green + "11", border: `1px solid ${C.green}33`, color: C.green,
          padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
        }}>
          ✓ Nenhuma conta atrasada
        </div>
      )}
    </Painel>
  );
}

function PainelEstoqueBaixo({ itens }) {
  return (
    <Painel
      titulo="Produtos com estoque baixo"
      acessorio={
        <span style={{
          background: itens.length > 0 ? C.yellow + "22" : C.surface,
          border: `1px solid ${itens.length > 0 ? C.yellow + "55" : C.border}`,
          color: itens.length > 0 ? C.yellow : C.muted,
          borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700,
        }}>
          {itens.length}
        </span>
      }
    >
      {itens.length === 0 ? (
        <Vazio texto="✓ Todos os produtos com estoque acima do mínimo." />
      ) : itens.map((p, idx) => (
        <div key={p.id} style={{
          display: "grid", gridTemplateColumns: "1fr auto", gap: 8,
          padding: "8px 0", alignItems: "center",
          borderBottom: idx < itens.length - 1 ? `1px solid ${C.border}` : "none",
        }}>
          <div>
            <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{p.nome}</div>
            <div style={{ color: C.muted, fontSize: 11, fontFamily: "monospace" }}>{p.codigo}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: C.yellow, fontSize: 13, fontWeight: 700 }}>
              {p.estoque} {p.unidade}
            </div>
            <div style={{ color: C.muted, fontSize: 10 }}>
              mín. {p.estoqueMinimo}
            </div>
          </div>
        </div>
      ))}
    </Painel>
  );
}

function PainelUltimasVendas({ itens }) {
  return (
    <Painel titulo="Últimas vendas">
      {itens.length === 0 ? (
        <Vazio texto="Nenhuma venda registrada ainda." />
      ) : itens.map((v, idx) => (
        <div key={v.id} style={{
          display: "grid", gridTemplateColumns: "60px 1fr auto", gap: 8,
          padding: "8px 0", alignItems: "center",
          borderBottom: idx < itens.length - 1 ? `1px solid ${C.border}` : "none",
        }}>
          <div style={{ color: C.accent, fontFamily: "monospace", fontWeight: 700, fontSize: 12 }}>
            #{v.numero}
          </div>
          <div>
            <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>
              {v.cliente || "Cliente avulso"}
            </div>
            <div style={{ color: C.muted, fontSize: 11 }}>
              {fmtData(v.createdAt)} · {ROTULO_PAGAMENTO[v.formaPagamento] || v.formaPagamento}
              {v.vendedor ? ` · ${v.vendedor}` : ""}
            </div>
          </div>
          <div style={{ color: C.green, fontSize: 13, fontWeight: 700 }}>{fmtBRL(v.total)}</div>
        </div>
      ))}
    </Painel>
  );
}

function PainelUltimasCompras({ itens }) {
  return (
    <Painel titulo="Últimas compras">
      {itens.length === 0 ? (
        <Vazio texto="Nenhuma compra registrada ainda." />
      ) : (
        <div style={{
          display: "grid", gap: 0,
        }}>
          {itens.map((c, idx) => (
            <div key={c.id} style={{
              display: "grid", gridTemplateColumns: "60px 1fr 200px auto", gap: 10,
              padding: "10px 0", alignItems: "center",
              borderBottom: idx < itens.length - 1 ? `1px solid ${C.border}` : "none",
            }}>
              <div style={{ color: C.purple, fontFamily: "monospace", fontWeight: 700, fontSize: 12 }}>
                #{c.numero}
              </div>
              <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>
                {c.fornecedor || "—"}
              </div>
              <div style={{ color: C.muted, fontSize: 11 }}>{fmtData(c.createdAt)}</div>
              <div style={{ color: C.yellow, fontSize: 13, fontWeight: 700 }}>{fmtBRL(c.total)}</div>
            </div>
          ))}
        </div>
      )}
    </Painel>
  );
}

function Vazio({ texto }) {
  return (
    <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "16px 0" }}>
      {texto}
    </div>
  );
}
