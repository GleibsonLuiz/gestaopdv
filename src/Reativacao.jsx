import { useEffect, useState, useCallback } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";
import BotoesContatoCliente from "./components/BotoesContatoCliente.jsx";

// ============ CONFIGURACAO ============

const MESES = [
  { num: 1,  nome: "Janeiro",   abrev: "Jan" },
  { num: 2,  nome: "Fevereiro", abrev: "Fev" },
  { num: 3,  nome: "Março",     abrev: "Mar" },
  { num: 4,  nome: "Abril",     abrev: "Abr" },
  { num: 5,  nome: "Maio",      abrev: "Mai" },
  { num: 6,  nome: "Junho",     abrev: "Jun" },
  { num: 7,  nome: "Julho",     abrev: "Jul" },
  { num: 8,  nome: "Agosto",    abrev: "Ago" },
  { num: 9,  nome: "Setembro",  abrev: "Set" },
  { num: 10, nome: "Outubro",   abrev: "Out" },
  { num: 11, nome: "Novembro",  abrev: "Nov" },
  { num: 12, nome: "Dezembro",  abrev: "Dez" },
];

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
};

// ============ COMPONENTE PRINCIPAL ============

export default function Reativacao({ user }) {
  const [aba, setAba] = useState("aniversariantes");
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    api.listarTemplates({ ativo: "true" }).then(setTemplates).catch(() => setTemplates([]));
  }, []);

  return (
    <div style={{ padding: 16, color: C.text }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: C.white, fontSize: 22, fontWeight: 700 }}>
          🎂 Aniversariantes e Reativação
        </h2>
        <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
          Listas prontas para abordagem proativa — converse com clientes nos momentos certos
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
        <BotaoAba ativo={aba === "aniversariantes"} onClick={() => setAba("aniversariantes")}>
          🎂 Aniversariantes
        </BotaoAba>
        <BotaoAba ativo={aba === "reativacao"} onClick={() => setAba("reativacao")}>
          ♻️ Reativação
        </BotaoAba>
      </div>

      {aba === "aniversariantes" && <AbaAniversariantes user={user} templates={templates} />}
      {aba === "reativacao" && <AbaReativacao user={user} templates={templates} />}
    </div>
  );
}

function BotaoAba({ ativo, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        color: ativo ? C.accent : C.muted,
        border: "none",
        borderBottom: `2px solid ${ativo ? C.accent : "transparent"}`,
        padding: "10px 16px",
        fontSize: 13,
        fontWeight: ativo ? 700 : 500,
        cursor: "pointer",
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

// ============ ABA ANIVERSARIANTES ============

function AbaAniversariantes({ templates }) {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      setDados(await api.aniversariantes({ mes }));
    } catch (e) {
      setErro(e.message || "Erro ao carregar");
    } finally {
      setCarregando(false);
    }
  }, [mes]);

  useEffect(() => { carregar(); }, [carregar]);

  const hoje = new Date();
  const ehDeHoje = (c) => c.diaNascimento === hoje.getDate() && c.mesNascimento === hoje.getMonth() + 1;
  const aniversariantesHoje = dados?.clientes?.filter(ehDeHoje) || [];

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <select
          value={mes}
          onChange={(e) => setMes(parseInt(e.target.value, 10))}
          style={{
            background: C.card, color: C.text, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: "8px 12px", fontSize: 13,
          }}
        >
          {MESES.map((m) => (
            <option key={m.num} value={m.num}>{m.nome}</option>
          ))}
        </select>
        <div style={{ marginLeft: "auto", color: C.muted, fontSize: 12 }}>
          {dados ? `${dados.total} aniversariante(s) em ${MESES[mes - 1].nome}` : ""}
        </div>
      </div>

      {erro && (
        <div style={{ background: C.red + "22", color: C.red, padding: "8px 12px", borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
          {erro}
        </div>
      )}

      {/* Destaque: aniversariantes de hoje */}
      {aniversariantesHoje.length > 0 && (
        <div style={{
          background: "#f59e0b11", border: `1px solid #f59e0b55`,
          borderRadius: 8, padding: 14, marginBottom: 14,
        }}>
          <div style={{ color: "#f59e0b", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            🎉 Aniversariantes de HOJE
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {aniversariantesHoje.map((c) => (
              <CardAniversariante key={c.id} cliente={c} templates={templates} destaque />
            ))}
          </div>
        </div>
      )}

      {carregando ? (
        <div style={{ color: C.muted, padding: 30, textAlign: "center" }}>Carregando...</div>
      ) : !dados || dados.clientes.length === 0 ? (
        <div style={{ color: C.muted, padding: 40, textAlign: "center", background: C.surface, borderRadius: 8, fontSize: 13 }}>
          Nenhum cliente com aniversário em {MESES[mes - 1].nome}.
          {mes === hoje.getMonth() + 1 && " Cadastre datas de nascimento em Clientes para popular essa lista."}
        </div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          {dados.clientes.map((c) => (
            <CardAniversariante key={c.id} cliente={c} templates={templates} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardAniversariante({ cliente, templates, destaque = false }) {
  const dataNasc = `${String(cliente.diaNascimento).padStart(2, "0")}/${String(cliente.mesNascimento).padStart(2, "0")}`;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
      borderTop: destaque ? "none" : `1px solid ${C.border}`,
      background: destaque ? "transparent" : C.surface,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: destaque ? "#f59e0b22" : C.card,
        color: destaque ? "#f59e0b" : C.muted,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        flexShrink: 0, fontWeight: 700,
      }}>
        <div style={{ fontSize: 16, lineHeight: 1 }}>{dataNasc.split("/")[0]}</div>
        <div style={{ fontSize: 9, lineHeight: 1, marginTop: 2 }}>{MESES[cliente.mesNascimento - 1].abrev}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.white, fontWeight: 600, fontSize: 14 }}>{cliente.nome}</div>
        <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
          🎂 {dataNasc} · {cliente.idade} anos
          {cliente.cidade && ` · ${cliente.cidade}/${cliente.estado || ""}`}
        </div>
        {cliente.tags && cliente.tags.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
            {cliente.tags.map((t) => (
              <span key={t.id} style={{
                background: t.cor + "22", color: t.cor,
                padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                border: `1px solid ${t.cor}55`,
              }}>{t.nome}</span>
            ))}
          </div>
        )}
      </div>
      <BotoesContatoCliente cliente={cliente} templates={templates} />
    </div>
  );
}

// ============ ABA REATIVACAO ============

function AbaReativacao({ templates }) {
  const [diasMin, setDiasMin] = useState(90);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      setDados(await api.clientesReativacao({ diasMin }));
    } catch (e) {
      setErro(e.message || "Erro ao carregar");
    } finally {
      setCarregando(false);
    }
  }, [diasMin]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div>
      {/* Filtros + KPIs */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 10, marginBottom: 14,
      }}>
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderLeft: `3px solid ${C.yellow}`,
          borderRadius: 8, padding: "10px 14px",
        }}>
          <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
            Sem comprar há
          </div>
          <select
            value={diasMin}
            onChange={(e) => setDiasMin(parseInt(e.target.value, 10))}
            style={{
              background: "transparent", color: C.white, border: "none",
              fontSize: 18, fontWeight: 700, marginTop: 4, width: "100%",
              outline: "none", cursor: "pointer", padding: 0,
            }}
          >
            <option value={30}>30+ dias</option>
            <option value={60}>60+ dias</option>
            <option value={90}>90+ dias</option>
            <option value={120}>120+ dias</option>
            <option value={180}>180+ dias</option>
            <option value={365}>1 ano+</option>
          </select>
        </div>
        {dados && (
          <>
            <Kpi label="Clientes elegíveis" valor={String(dados.total)} icone="👥" cor={C.accent}
                 sub="Já compraram antes" />
            <Kpi label="LTV total em risco" valor={fmtBRL(dados.totalLtv)} icone="💰" cor={C.green}
                 sub="Valor histórico desses clientes" />
            <Kpi label="LTV médio" valor={fmtBRL(dados.total > 0 ? dados.totalLtv / dados.total : 0)} icone="📊" cor={"#7c3aed"} />
          </>
        )}
      </div>

      {erro && (
        <div style={{ background: C.red + "22", color: C.red, padding: "8px 12px", borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
          {erro}
        </div>
      )}

      {carregando ? (
        <div style={{ color: C.muted, padding: 30, textAlign: "center" }}>Carregando...</div>
      ) : !dados || dados.clientes.length === 0 ? (
        <div style={{ color: C.muted, padding: 40, textAlign: "center", background: C.surface, borderRadius: 8, fontSize: 13 }}>
          🎉 Nenhum cliente precisando de reativação com esse critério.
        </div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.bg, color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  <th style={th()}>Cliente</th>
                  <th style={{ ...th(), textAlign: "center" }}>Última compra</th>
                  <th style={{ ...th(), textAlign: "center" }}>Dias sem comprar</th>
                  <th style={{ ...th(), textAlign: "center" }}>Compras</th>
                  <th style={{ ...th(), textAlign: "right" }}>LTV</th>
                  <th style={th()}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {dados.clientes.map((c) => (
                  <tr key={c.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td()}>
                      <div style={{ color: C.white, fontWeight: 600 }}>{c.nome}</div>
                      <div style={{ color: C.muted, fontSize: 11 }}>
                        {[c.cidade, c.estado].filter(Boolean).join("/")}
                        {c.telefone && ` · ${c.telefone}`}
                      </div>
                      {c.tags && c.tags.length > 0 && (
                        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                          {c.tags.map((t) => (
                            <span key={t.id} style={{
                              background: t.cor + "22", color: t.cor,
                              padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                            }}>{t.nome}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td(), textAlign: "center", color: C.muted, fontSize: 12 }}>
                      {fmtData(c.ultimaCompra)}
                    </td>
                    <td style={{ ...td(), textAlign: "center" }}>
                      <span style={{
                        background: c.recenciaDias > 180 ? C.red + "22" : C.yellow + "22",
                        color: c.recenciaDias > 180 ? C.red : C.yellow,
                        padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                      }}>
                        {c.recenciaDias}d
                      </span>
                    </td>
                    <td style={{ ...td(), textAlign: "center", color: C.text }}>{c.qtdCompras}</td>
                    <td style={{ ...td(), textAlign: "right", color: C.green, fontWeight: 700 }}>{fmtBRL(c.ltv)}</td>
                    <td style={td()}>
                      <BotoesContatoCliente cliente={c} templates={templates} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ COMPONENTES AUXILIARES ============

function Kpi({ label, valor, icone, cor, sub }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${cor}`,
      borderRadius: 8, padding: "10px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
        <span>{icone}</span> {label}
      </div>
      <div style={{ color: C.white, fontSize: 18, fontWeight: 700, marginTop: 4 }}>{valor}</div>
      {sub && <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function th() { return { padding: "10px 12px", textAlign: "left", fontWeight: 700 }; }
function td() { return { padding: "10px 12px", verticalAlign: "middle" }; }
