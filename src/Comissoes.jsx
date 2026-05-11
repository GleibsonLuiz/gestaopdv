import { useEffect, useMemo, useState, useCallback } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";
import RelatorioComissoes from "./components/RelatorioComissoes.jsx";

const fmtBRL = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ROLE_INFO = {
  ADMIN:    { label: "Admin",    cor: C.purple },
  GERENTE:  { label: "Gerente",  cor: C.accent },
  VENDEDOR: { label: "Vendedor", cor: C.green  },
};

// Margem media estimada — usada apenas no simulador quando a base e
// LUCRO_LIQUIDO. Em uma versao futura pode vir de cada produto, mas para a
// simulacao um valor configuravel pelo usuario ja resolve.
const MARGEM_PADRAO = 30;

const ABAS_COMISSAO = [
  { id: "config",   label: "⚙️ Configuração", cor: C.accent },
  { id: "evolucao", label: "📈 Evolução",      cor: C.green  },
];

export default function Comissoes({ user }) {
  const [aba, setAba] = useState("config");

  return (
    <div>
      <div style={{
        display: "flex", gap: 4, padding: 4, marginBottom: 18,
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 10, width: "fit-content",
      }}>
        {ABAS_COMISSAO.map(a => (
          <button key={a.id} onClick={() => setAba(a.id)} style={{
            padding: "10px 18px", borderRadius: 8, border: "none",
            background: aba === a.id ? a.cor + "22" : "transparent",
            color: aba === a.id ? a.cor : C.muted,
            fontWeight: aba === a.id ? 700 : 600, fontSize: 13, cursor: "pointer",
          }}>{a.label}</button>
        ))}
      </div>

      {aba === "config" && <ComissoesConfig user={user} />}
      {aba === "evolucao" && <RelatorioComissoes />}
    </div>
  );
}

function ComissoesConfig({ user }) {
  const [vendedores, setVendedores] = useState([]);
  const [vendedorId, setVendedorId] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [tipo, setTipo] = useState("PORCENTAGEM");
  const [base, setBase] = useState("VALOR_BRUTO");
  const [valor, setValor] = useState("5");
  const [metaMensal, setMetaMensal] = useState("10000");
  const [bonusPorMeta, setBonusPorMeta] = useState("10");
  const [ativo, setAtivo] = useState(true);

  // Inputs do simulador
  const [vendaSimulada, setVendaSimulada] = useState("10000");
  const [margemSimulada, setMargemSimulada] = useState(String(MARGEM_PADRAO));

  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const lista = await api.listarVendedoresComissao();
      setVendedores(lista);
      // Seleciona automaticamente o primeiro vendedor disponivel
      if (!vendedorId && lista.length > 0) {
        setVendedorId(lista[0].id);
      }
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [vendedorId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Quando troca o vendedor, popula os inputs com a config existente (ou
  // valores padrao para configurar pela primeira vez).
  useEffect(() => {
    const v = vendedores.find(x => x.id === vendedorId);
    const cfg = v?.configuracaoComissao;
    if (cfg) {
      setTipo(cfg.tipo);
      setBase(cfg.base);
      setValor(String(cfg.valor));
      setMetaMensal(String(cfg.metaMensal));
      setBonusPorMeta(String(cfg.bonusPorMeta));
      setAtivo(cfg.ativo);
    } else {
      // Sem config — defaults sugeridos
      setTipo("PORCENTAGEM");
      setBase("VALOR_BRUTO");
      setValor("5");
      setMetaMensal("10000");
      setBonusPorMeta("10");
      setAtivo(true);
    }
  }, [vendedorId, vendedores]);

  function flash(msg) {
    setMensagem(msg);
    setTimeout(() => setMensagem(""), 2500);
  }

  // ============ SIMULACAO (em tempo real) ============
  // Calcula a comissao com base nos parametros atuais. Quando base e
  // LUCRO_LIQUIDO, aplica a margem informada sobre a venda simulada para
  // estimar o lucro.
  const simulacao = useMemo(() => {
    const venda = Number(vendaSimulada) || 0;
    const margem = Math.max(0, Math.min(100, Number(margemSimulada) || 0));
    const aliquota = Number(valor) || 0;
    const meta = Number(metaMensal) || 0;
    const bonus = Number(bonusPorMeta) || 0;

    const baseCalc = base === "LUCRO_LIQUIDO" ? venda * (margem / 100) : venda;

    let comissaoBase;
    if (tipo === "PORCENTAGEM") comissaoBase = baseCalc * (aliquota / 100);
    else                        comissaoBase = aliquota; // valor fixo por venda

    const atingiuMeta = meta > 0 && venda >= meta;
    const valorBonus = atingiuMeta ? comissaoBase * (bonus / 100) : 0;
    const total = comissaoBase + valorBonus;

    return { baseCalc, comissaoBase, valorBonus, total, atingiuMeta };
  }, [vendaSimulada, margemSimulada, valor, metaMensal, bonusPorMeta, tipo, base]);

  async function salvar() {
    if (!vendedorId) { setErro("Selecione um vendedor"); return; }
    setSalvando(true);
    setErro("");
    try {
      await api.salvarComissao(vendedorId, {
        tipo, base,
        valor: Number(valor) || 0,
        metaMensal: Number(metaMensal) || 0,
        bonusPorMeta: Number(bonusPorMeta) || 0,
        ativo,
      });
      flash("Configuração salva com sucesso.");
      carregar();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  const vendedorSelecionado = vendedores.find(v => v.id === vendedorId);
  const temConfig = !!vendedorSelecionado?.configuracaoComissao;

  if (!podeEditar) {
    return (
      <div style={cardVazio}>
        🔒 Apenas administradores e gerentes podem configurar comissões.
      </div>
    );
  }

  return (
    <div>
      {/* Mensagens */}
      {mensagem && (
        <div style={alertSucesso}>{mensagem}</div>
      )}
      {erro && (
        <div style={alertErro}>{erro}</div>
      )}

      <div style={{
        display: "grid", gap: 16,
        gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
        alignItems: "start",
      }} className="gp-comissoes-grid">
        {/* ============ Coluna esquerda: configuracao ============ */}
        <div style={card}>
          <div style={cardHeader}>
            <span style={{ fontSize: 18 }}>🏆</span>
            <div>
              <div style={cardTitulo}>Configurar comissão</div>
              <div style={cardSubtitulo}>
                Defina como o vendedor selecionado será remunerado
              </div>
            </div>
          </div>

          {/* Vendedor */}
          <Campo label="Vendedor" icone="👤">
            <select
              value={vendedorId}
              onChange={e => setVendedorId(e.target.value)}
              style={inputStyle}
              disabled={carregando}
            >
              {vendedores.length === 0 && (
                <option value="">{carregando ? "Carregando..." : "Nenhum vendedor disponível"}</option>
              )}
              {vendedores.map(v => {
                const r = ROLE_INFO[v.role] || ROLE_INFO.VENDEDOR;
                const tag = v.configuracaoComissao ? " • configurado" : " • sem regra";
                return (
                  <option key={v.id} value={v.id}>
                    {v.nome} ({r.label}){tag}
                  </option>
                );
              })}
            </select>
            {vendedorSelecionado && (
              <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>
                {temConfig
                  ? "Editando configuração existente."
                  : "Vendedor ainda sem regra — preencha e salve."}
              </div>
            )}
          </Campo>

          <Divider />

          {/* Tipo de comissao (radio group visual) */}
          <Campo label="Tipo de comissão" icone="⚖️">
            <div style={radioGroup}>
              <RadioCard
                ativo={tipo === "PORCENTAGEM"}
                onClick={() => setTipo("PORCENTAGEM")}
                icone="%"
                titulo="Porcentagem"
                descricao="Aplica uma alíquota sobre a base"
              />
              <RadioCard
                ativo={tipo === "VALOR_FIXO"}
                onClick={() => setTipo("VALOR_FIXO")}
                icone="R$"
                titulo="Valor Fixo"
                descricao="Paga um valor fechado por venda"
              />
            </div>
          </Campo>

          {/* Base de calculo */}
          <Campo label="Base de cálculo" icone="📊">
            <select value={base} onChange={e => setBase(e.target.value)} style={inputStyle}>
              <option value="VALOR_BRUTO">Valor Bruto da Venda</option>
              <option value="LUCRO_LIQUIDO">Lucro Líquido (margem)</option>
            </select>
            <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>
              {base === "VALOR_BRUTO"
                ? "A comissão incide sobre o total faturado da venda."
                : "A comissão incide sobre o lucro (preço de venda − preço de custo)."}
            </div>
          </Campo>

          {/* Aliquota / valor */}
          <div style={twoCols}>
            <Campo
              label={tipo === "PORCENTAGEM" ? "Alíquota (%)" : "Valor por venda (R$)"}
              icone={tipo === "PORCENTAGEM" ? "📈" : "💵"}
            >
              <InputNumero
                value={valor}
                onChange={setValor}
                min={0}
                max={tipo === "PORCENTAGEM" ? 100 : undefined}
                step={tipo === "PORCENTAGEM" ? 0.5 : 1}
                sufixo={tipo === "PORCENTAGEM" ? "%" : "R$"}
              />
            </Campo>

            <Campo label="Meta mensal (R$)" icone="🎯">
              <InputNumero
                value={metaMensal}
                onChange={setMetaMensal}
                min={0}
                step={100}
                sufixo="R$"
              />
            </Campo>
          </div>

          <Campo label="Bônus por meta (%)" icone="🌟">
            <InputNumero
              value={bonusPorMeta}
              onChange={setBonusPorMeta}
              min={0}
              max={100}
              step={1}
              sufixo="%"
            />
            <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>
              Acréscimo aplicado sobre a comissão calculada quando o vendedor bate a meta.
            </div>
          </Campo>

          <Divider />

          {/* Ativo */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <Switch ativo={ativo} onClick={() => setAtivo(!ativo)} />
            <div>
              <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>
                Configuração ativa
              </div>
              <div style={{ color: C.muted, fontSize: 11 }}>
                Quando inativa, o sistema não calcula comissão para este vendedor.
              </div>
            </div>
          </label>

          <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={salvar}
              disabled={!vendedorId || salvando}
              style={btnPrimario}
            >
              {salvando ? "Salvando..." : (temConfig ? "💾 Salvar alterações" : "✨ Criar configuração")}
            </button>
          </div>
        </div>

        {/* ============ Coluna direita: simulacao ============ */}
        <div style={{ display: "grid", gap: 16 }}>
          <SimulacaoCard
            vendaSimulada={vendaSimulada}
            setVendaSimulada={setVendaSimulada}
            margemSimulada={margemSimulada}
            setMargemSimulada={setMargemSimulada}
            base={base}
            tipo={tipo}
            simulacao={simulacao}
            valor={valor}
            metaMensal={metaMensal}
            bonusPorMeta={bonusPorMeta}
            vendedor={vendedorSelecionado}
          />

          <ResumoRegrasCard
            tipo={tipo}
            base={base}
            valor={valor}
            metaMensal={metaMensal}
            bonusPorMeta={bonusPorMeta}
          />
        </div>
      </div>

      <style>{`
        @media (max-width: 980px) {
          .gp-comissoes-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

// ============ SUBCOMPONENTES ============

function SimulacaoCard({
  vendaSimulada, setVendaSimulada,
  margemSimulada, setMargemSimulada,
  base, tipo, simulacao, valor, metaMensal, bonusPorMeta, vendedor,
}) {
  const venda = Number(vendaSimulada) || 0;
  const meta = Number(metaMensal) || 0;
  const progresso = meta > 0 ? Math.min(100, (venda / meta) * 100) : 0;

  return (
    <div style={{
      ...card,
      background: `linear-gradient(135deg, ${C.accent}11, ${C.purple}11)`,
      borderColor: C.accent + "55",
    }}>
      <div style={cardHeader}>
        <span style={{ fontSize: 18 }}>🧮</span>
        <div>
          <div style={cardTitulo}>Simulação em tempo real</div>
          <div style={cardSubtitulo}>
            {vendedor ? `Para ${vendedor.nome}` : "Calcule quanto o vendedor receberia"}
          </div>
        </div>
      </div>

      <Campo label="Venda simulada (R$)" icone="🛒">
        <InputNumero value={vendaSimulada} onChange={setVendaSimulada} min={0} step={500} sufixo="R$" />
      </Campo>

      {base === "LUCRO_LIQUIDO" && (
        <Campo label="Margem média estimada (%)" icone="📐">
          <InputNumero value={margemSimulada} onChange={setMargemSimulada} min={0} max={100} step={1} sufixo="%" />
          <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>
            Lucro estimado = Venda × Margem. Em produção, vem do preço de custo de cada item.
          </div>
        </Campo>
      )}

      <Divider />

      {/* Resultado destacado */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 16, marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>
          Comissão estimada
        </div>
        <div style={{
          fontSize: 32, fontWeight: 800, color: C.green, marginTop: 4,
          fontVariantNumeric: "tabular-nums",
        }}>
          {fmtBRL(simulacao.total)}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
          Se o vendedor vender <strong style={{ color: C.white }}>{fmtBRL(venda)}</strong>,
          {" "}ele receberá <strong style={{ color: C.green }}>{fmtBRL(simulacao.total)}</strong> de comissão.
        </div>
      </div>

      {/* Breakdown */}
      <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
        <LinhaResumo
          label={base === "LUCRO_LIQUIDO" ? "Base (lucro)" : "Base (valor bruto)"}
          valor={fmtBRL(simulacao.baseCalc)}
        />
        <LinhaResumo
          label={tipo === "PORCENTAGEM" ? `Comissão (${valor || 0}%)` : `Comissão (valor fixo)`}
          valor={fmtBRL(simulacao.comissaoBase)}
        />
        {Number(bonusPorMeta) > 0 && (
          <LinhaResumo
            label={`Bônus por meta (+${bonusPorMeta}%)`}
            valor={fmtBRL(simulacao.valorBonus)}
            destaque={simulacao.atingiuMeta ? C.green : C.muted}
          />
        )}
      </div>

      {/* Barra de progresso da meta */}
      {meta > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 11, color: C.muted, marginBottom: 6,
          }}>
            <span>Meta: {fmtBRL(meta)}</span>
            <span style={{ color: simulacao.atingiuMeta ? C.green : C.muted, fontWeight: 700 }}>
              {progresso.toFixed(0)}%{simulacao.atingiuMeta ? " ✓" : ""}
            </span>
          </div>
          <div style={{
            height: 8, background: C.bg, borderRadius: 999, overflow: "hidden",
            border: `1px solid ${C.border}`,
          }}>
            <div style={{
              width: `${progresso}%`, height: "100%",
              background: simulacao.atingiuMeta
                ? `linear-gradient(90deg, ${C.green}, ${C.accent})`
                : `linear-gradient(90deg, ${C.accent}, ${C.purple})`,
              transition: "width 0.25s ease",
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

function ResumoRegrasCard({ tipo, base, valor, metaMensal, bonusPorMeta }) {
  return (
    <div style={card}>
      <div style={cardHeader}>
        <span style={{ fontSize: 18 }}>📋</span>
        <div>
          <div style={cardTitulo}>Regra atual</div>
          <div style={cardSubtitulo}>Resumo legível da configuração</div>
        </div>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        <ItemRegra
          icone="⚖️"
          texto={tipo === "PORCENTAGEM"
            ? <>Comissão de <strong>{valor || 0}%</strong> sobre {base === "LUCRO_LIQUIDO" ? "o lucro" : "o valor bruto"}.</>
            : <>Valor fixo de <strong>{fmtBRL(valor)}</strong> por venda concluída.</>}
        />
        <ItemRegra
          icone="🎯"
          texto={Number(metaMensal) > 0
            ? <>Meta mensal de <strong>{fmtBRL(metaMensal)}</strong>.</>
            : <>Sem meta mensal definida.</>}
        />
        <ItemRegra
          icone="🌟"
          texto={Number(bonusPorMeta) > 0 && Number(metaMensal) > 0
            ? <>Bônus de <strong>+{bonusPorMeta}%</strong> sobre a comissão ao bater a meta.</>
            : <>Sem bônus por meta.</>}
        />
      </ul>
    </div>
  );
}

function ItemRegra({ icone, texto }) {
  return (
    <li style={{
      display: "flex", gap: 10, alignItems: "flex-start",
      padding: "10px 12px", background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 8, color: C.text, fontSize: 12, lineHeight: 1.5,
    }}>
      <span style={{ fontSize: 14, lineHeight: 1.2 }}>{icone}</span>
      <span style={{ flex: 1 }}>{texto}</span>
    </li>
  );
}

function LinhaResumo({ label, valor, destaque }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: destaque || C.text, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {valor}
      </span>
    </div>
  );
}

function Campo({ label, icone, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: "flex", alignItems: "center", gap: 6,
        color: C.muted, fontSize: 12, marginBottom: 6, fontWeight: 600,
      }}>
        {icone && <span>{icone}</span>}
        <span>{label}</span>
      </label>
      {children}
    </div>
  );
}

function RadioCard({ ativo, onClick, icone, titulo, descricao }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, minWidth: 0, textAlign: "left", cursor: "pointer",
        background: ativo ? C.accent + "1a" : C.surface,
        border: `1px solid ${ativo ? C.accent : C.border}`,
        borderRadius: 10, padding: "12px 14px",
        display: "flex", alignItems: "center", gap: 12,
        transition: "background 0.15s ease, border-color 0.15s ease",
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
        background: ativo ? C.accent : C.card,
        color: ativo ? C.white : C.muted,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: 14,
      }}>{icone}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: ativo ? C.white : C.text, fontSize: 13, fontWeight: 700 }}>
          {titulo}
        </div>
        <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
          {descricao}
        </div>
      </div>
    </button>
  );
}

function InputNumero({ value, onChange, min, max, step = 1, sufixo }) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        min={min}
        max={max}
        step={step}
        style={{ ...inputStyle, paddingRight: sufixo ? 48 : 12 }}
      />
      {sufixo && (
        <span style={{
          position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
          fontSize: 11, fontWeight: 700, color: C.muted, pointerEvents: "none",
        }}>{sufixo}</span>
      )}
    </div>
  );
}

function Switch({ ativo, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 38, height: 22, borderRadius: 999, position: "relative",
        background: ativo ? C.accent : C.border, border: "none",
        cursor: "pointer", flexShrink: 0,
        transition: "background 0.15s ease",
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: ativo ? 19 : 3,
        width: 16, height: 16, borderRadius: "50%",
        background: C.white, transition: "left 0.15s ease",
      }} />
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: C.border, margin: "16px 0" }} />;
}

// ============ ESTILOS ============

const card = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: 20,
};

const cardHeader = {
  display: "flex", alignItems: "center", gap: 10,
  marginBottom: 16,
};

const cardTitulo = {
  color: C.white, fontWeight: 700, fontSize: 15, lineHeight: 1.2,
};

const cardSubtitulo = {
  color: C.muted, fontSize: 11, marginTop: 2,
};

const cardVazio = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
  padding: 30, textAlign: "center", color: C.muted, fontSize: 14,
};

const inputStyle = {
  width: "100%", background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 13,
  outline: "none", boxSizing: "border-box",
};

const radioGroup = {
  display: "flex", gap: 10, flexWrap: "wrap",
};

const twoCols = {
  display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr",
};

const btnPrimario = {
  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
  color: C.white, border: "none", borderRadius: 8,
  padding: "10px 22px", fontWeight: 700, fontSize: 13, cursor: "pointer",
};

const alertSucesso = {
  marginBottom: 12, padding: "10px 14px", borderRadius: 8,
  background: C.green + "22", border: `1px solid ${C.green}55`,
  color: C.green, fontSize: 13,
};

const alertErro = {
  marginBottom: 12, padding: "10px 14px", borderRadius: 8,
  background: C.red + "22", border: `1px solid ${C.red}55`,
  color: C.red, fontSize: 13,
};
