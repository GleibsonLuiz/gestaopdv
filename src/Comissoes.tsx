import { useEffect, useMemo, useState, useCallback, lazy, Suspense, type CSSProperties, type ReactNode } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser, type Role } from "./lib/api";

// Lazy: RelatorioComissoes carrega recharts (~400 kB). Sai do chunk
// principal de Comissoes — so e baixado quando o usuario abre a aba
// "Evolucao" (a aba default e "config").
const RelatorioComissoes = lazy(() => import("./components/RelatorioComissoes"));

// ============ TIPOS ============

type TipoComissao = "PORCENTAGEM" | "VALOR_FIXO";
type BaseComissao = "VALOR_BRUTO" | "LUCRO_LIQUIDO";
type AbaId = "config" | "metas" | "evolucao";

interface RoleInfo {
  label: string;
  cor: string;
}

interface ConfiguracaoComissaoCompleta {
  tipo: TipoComissao;
  base: BaseComissao;
  valor: number;
  metaMensal: number;
  bonusPorMeta: number;
  ativo: boolean;
}

interface VendedorComissao {
  id: string;
  nome: string;
  role: Role;
  configuracaoComissao?: ConfiguracaoComissaoCompleta | null;
}

interface AbaDef {
  id: AbaId;
  label: string;
  cor: string;
}

interface SimulacaoResult {
  baseCalc: number;
  comissaoBase: number;
  valorBonus: number;
  total: number;
  atingiuMeta: boolean;
}

const fmtBRL = (n: number | string | null | undefined): string =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ROLE_INFO: Record<Role, RoleInfo> = {
  ADMIN:    { label: "Admin",    cor: C.purple },
  GERENTE:  { label: "Gerente",  cor: C.accent },
  VENDEDOR: { label: "Vendedor", cor: C.green  },
};

const MARGEM_PADRAO = 30;

const ABAS_COMISSAO: AbaDef[] = [
  { id: "config",   label: "⚙️ Configuração",  cor: C.accent },
  { id: "metas",    label: "🎯 Metas do mês",  cor: C.purple },
  { id: "evolucao", label: "📈 Evolução",      cor: C.green  },
];

interface ComissoesProps {
  user: SessionUser;
}

export default function Comissoes({ user }: ComissoesProps) {
  const [aba, setAba] = useState<AbaId>("config");

  return (
    <div>
      <div
        className="flex gap-1 mb-[18px] w-fit rounded-[10px]"
        style={{
          padding: 4,
          background: C.surface,
          border: `1px solid ${C.border}`,
        }}
      >
        {ABAS_COMISSAO.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className="rounded-lg border-none text-[13px] cursor-pointer"
            style={{
              padding: "10px 18px",
              background: aba === a.id ? a.cor + "22" : "transparent",
              color: aba === a.id ? a.cor : C.muted,
              fontWeight: aba === a.id ? 700 : 600,
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === "config" && <ComissoesConfig user={user} />}
      {aba === "metas" && <MetasMes />}
      {aba === "evolucao" && (
        <Suspense fallback={
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>
            Carregando gráficos...
          </div>
        }>
          <RelatorioComissoes />
        </Suspense>
      )}
    </div>
  );
}

// ============ ABA METAS DO MES (pacing + ranking) ============

interface MetaVendedor {
  id: string;
  nome: string;
  role: Role;
  meta: number;
  realizado: number;
  vendasCount: number;
  percentual: number;
  projecao: number;
  percentualProjetado: number;
  falta: number;
  ritmoNecessarioDia: number;
  bonusPorMeta: number;
  status: "BATIDA" | "NO_RITMO" | "ATENCAO" | "ATRASADO" | "ABAIXO";
}

interface MetasMesResp {
  mes: string;
  ehMesCorrente: boolean;
  diasNoMes: number;
  diasDecorridos: number;
  diasRestantes: number;
  resumo: {
    totalMeta: number;
    totalRealizado: number;
    percentual: number;
    vendedoresComMeta: number;
    vendedoresBateram: number;
  };
  vendedores: MetaVendedor[];
}

const STATUS_META: Record<MetaVendedor["status"], { label: string; cor: string }> = {
  BATIDA:   { label: "🏆 Meta batida", cor: C.green },
  NO_RITMO: { label: "✅ No ritmo",    cor: C.accent },
  ATENCAO:  { label: "⚠️ Atenção",     cor: C.yellow },
  ATRASADO: { label: "🔴 Atrasado",    cor: C.red },
  ABAIXO:   { label: "Abaixo da meta", cor: C.muted },
};

function mesAtualISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function MetasMes() {
  const [mes, setMes] = useState(mesAtualISO);
  const [dados, setDados] = useState<MetasMesResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro("");
    api.metasMesComissoes({ mes })
      .then((d) => { if (ativo) setDados(d as MetasMesResp); })
      .catch((e) => { if (ativo) setErro((e as Error).message); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [mes]);

  const medalha = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`);

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecalho: seletor de mes + resumo */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value || mesAtualISO())}
          aria-label="Mês de referência"
          className="rounded-lg text-[13px] outline-none"
          style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "8px 12px" }}
        />
        {dados && (
          <div className="text-gp-muted text-xs">
            {dados.ehMesCorrente
              ? `Dia ${dados.diasDecorridos} de ${dados.diasNoMes} · faltam ${dados.diasRestantes} dia(s)`
              : `Mês fechado (${dados.diasNoMes} dias)`}
          </div>
        )}
      </div>

      {erro && (
        <div className="rounded-lg text-[13px] text-gp-red" style={{ padding: "10px 14px", background: C.red + "22", border: `1px solid ${C.red}55` }}>
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="text-gp-muted py-10 text-center text-[13px]">Carregando metas...</div>
      ) : !dados || dados.vendedores.length === 0 ? (
        <div className="text-gp-muted py-10 text-center text-[13px]">
          Nenhum vendedor com meta configurada. Defina a <strong>meta mensal</strong> na aba ⚙️ Configuração.
        </div>
      ) : (
        <>
          {/* Resumo geral da equipe */}
          <div
            className="rounded-xl flex flex-wrap gap-5"
            style={{ padding: "16px 20px", background: C.surface, border: `1px solid ${C.border}` }}
          >
            <ResumoItem label="Meta da equipe" valor={fmtBRL(dados.resumo.totalMeta)} />
            <ResumoItem label="Realizado" valor={fmtBRL(dados.resumo.totalRealizado)} cor={C.green} />
            <ResumoItem
              label="Atingimento"
              valor={`${dados.resumo.percentual.toFixed(0)}%`}
              cor={dados.resumo.percentual >= 100 ? C.green : dados.resumo.percentual >= 80 ? C.yellow : C.red}
            />
            <ResumoItem
              label="Bateram a meta"
              valor={`${dados.resumo.vendedoresBateram}/${dados.resumo.vendedoresComMeta}`}
            />
          </div>

          {/* Ranking de vendedores */}
          <div className="flex flex-col gap-2.5">
            {dados.vendedores.map((v, i) => {
              const st = STATUS_META[v.status];
              const pct = Math.min(100, v.percentual);
              return (
                <div
                  key={v.id}
                  className="rounded-xl"
                  style={{ padding: "14px 16px", background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${st.cor}` }}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-base font-extrabold" style={{ color: i < 3 ? C.yellow : C.muted, minWidth: 28 }}>
                        {medalha(i)}
                      </span>
                      <span className="text-gp-white font-bold text-sm truncate">{v.nome}</span>
                      <span
                        className="text-[10px] font-bold uppercase rounded px-1.5 py-0.5"
                        style={{ background: st.cor + "22", color: st.cor, border: `1px solid ${st.cor}44` }}
                      >
                        {st.label}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-gp-white font-extrabold text-base">{v.percentual.toFixed(0)}%</span>
                      <span className="text-gp-muted text-xs ml-1">de {fmtBRL(v.meta)}</span>
                    </div>
                  </div>

                  {/* Barra de atingimento com marcador de projecao */}
                  <div className="w-full overflow-hidden rounded-md relative" style={{ height: 14, background: C.bg, border: `1px solid ${C.border}` }}>
                    <div className="h-full" style={{ width: `${pct}%`, background: st.cor, transition: "width 0.3s ease" }} />
                    {/* Marcador da projecao (so no mes corrente e quando ainda nao bateu) */}
                    {dados.ehMesCorrente && v.status !== "BATIDA" && v.percentualProjetado > 0 && (
                      <div
                        className="absolute top-0 bottom-0"
                        title={`Projeção pelo ritmo atual: ${v.percentualProjetado.toFixed(0)}% (${fmtBRL(v.projecao)})`}
                        style={{ left: `${Math.min(100, v.percentualProjetado)}%`, width: 2, background: C.white, opacity: 0.85 }}
                      />
                    )}
                  </div>

                  <div className="flex justify-between flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gp-muted">
                    <span>Realizado: <strong className="text-gp-text">{fmtBRL(v.realizado)}</strong> ({v.vendasCount} venda{v.vendasCount === 1 ? "" : "s"})</span>
                    {dados.ehMesCorrente && v.status !== "BATIDA" && (
                      <>
                        <span title="Projeção do mês mantendo o ritmo atual">Projeção: <strong style={{ color: v.percentualProjetado >= 100 ? C.green : C.yellow }}>{fmtBRL(v.projecao)}</strong></span>
                        {v.falta > 0 && (
                          <span>Falta <strong className="text-gp-text">{fmtBRL(v.falta)}</strong>{dados.diasRestantes > 0 ? ` · ${fmtBRL(v.ritmoNecessarioDia)}/dia` : ""}</span>
                        )}
                      </>
                    )}
                    {v.status === "BATIDA" && v.bonusPorMeta > 0 && (
                      <span style={{ color: C.green }}>+{v.bonusPorMeta}% de bônus garantido 🎉</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ResumoItem({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-gp-muted text-[10px] uppercase font-bold" style={{ letterSpacing: "0.05em" }}>{label}</span>
      <span className="text-lg font-extrabold" style={{ color: cor || C.text }}>{valor}</span>
    </div>
  );
}

interface ComissoesConfigProps {
  user: SessionUser;
}

function ComissoesConfig({ user }: ComissoesConfigProps) {
  const [vendedores, setVendedores] = useState<VendedorComissao[]>([]);
  const [vendedorId, setVendedorId] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [tipo, setTipo] = useState<TipoComissao>("PORCENTAGEM");
  const [base, setBase] = useState<BaseComissao>("VALOR_BRUTO");
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
      const lista = await api.listarVendedoresComissao() as VendedorComissao[];
      setVendedores(lista || []);
      if (!vendedorId && lista && lista.length > 0) {
        setVendedorId(lista[0].id);
      }
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [vendedorId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Quando troca o vendedor, popula os inputs com a config existente.
  useEffect(() => {
    const v = vendedores.find((x) => x.id === vendedorId);
    const cfg = v?.configuracaoComissao;
    if (cfg) {
      setTipo(cfg.tipo);
      setBase(cfg.base);
      setValor(String(cfg.valor));
      setMetaMensal(String(cfg.metaMensal));
      setBonusPorMeta(String(cfg.bonusPorMeta));
      setAtivo(cfg.ativo);
    } else {
      setTipo("PORCENTAGEM");
      setBase("VALOR_BRUTO");
      setValor("5");
      setMetaMensal("10000");
      setBonusPorMeta("10");
      setAtivo(true);
    }
  }, [vendedorId, vendedores]);

  function flash(msg: string) {
    setMensagem(msg);
    setTimeout(() => setMensagem(""), 2500);
  }

  // ============ SIMULACAO (em tempo real) ============
  const simulacao = useMemo<SimulacaoResult>(() => {
    const venda = Number(vendaSimulada) || 0;
    const margem = Math.max(0, Math.min(100, Number(margemSimulada) || 0));
    const aliquota = Number(valor) || 0;
    const meta = Number(metaMensal) || 0;
    const bonus = Number(bonusPorMeta) || 0;

    const baseCalc = base === "LUCRO_LIQUIDO" ? venda * (margem / 100) : venda;

    let comissaoBase: number;
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
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const vendedorSelecionado = vendedores.find((v) => v.id === vendedorId);
  const temConfig = !!vendedorSelecionado?.configuracaoComissao;

  if (!podeEditar) {
    return (
      <div style={cardVazioStyle}>
        🔒 Apenas administradores e gerentes podem configurar comissões.
      </div>
    );
  }

  return (
    <div>
      {mensagem && (
        <div style={alertSucessoStyle}>{mensagem}</div>
      )}
      {erro && (
        <div style={alertErroStyle}>{erro}</div>
      )}

      <div
        className="grid gap-4 items-start gp-comissoes-grid"
        style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)" }}
      >
        {/* Coluna esquerda: configuracao */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <span className="text-lg">🏆</span>
            <div>
              <div style={cardTituloStyle}>Configurar comissão</div>
              <div style={cardSubtituloStyle}>
                Defina como o vendedor selecionado será remunerado
              </div>
            </div>
          </div>

          <Campo label="Vendedor" icone="👤">
            <select
              value={vendedorId}
              onChange={(e) => setVendedorId(e.target.value)}
              disabled={carregando}
              aria-label="Vendedor"
              style={inputStyle}
            >
              {vendedores.length === 0 && (
                <option value="">{carregando ? "Carregando..." : "Nenhum vendedor disponível"}</option>
              )}
              {vendedores.map((v) => {
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
              <div className="mt-1.5 text-[11px] text-gp-muted">
                {temConfig
                  ? "Editando configuração existente."
                  : "Vendedor ainda sem regra — preencha e salve."}
              </div>
            )}
          </Campo>

          <Divider />

          <Campo label="Tipo de comissão" icone="⚖️">
            <div className="flex gap-2.5 flex-wrap">
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

          <Campo label="Base de cálculo" icone="📊">
            <select
              value={base}
              onChange={(e) => setBase(e.target.value as BaseComissao)}
              aria-label="Base de cálculo"
              style={inputStyle}
            >
              <option value="VALOR_BRUTO">Valor Bruto da Venda</option>
              <option value="LUCRO_LIQUIDO">Lucro Líquido (margem)</option>
            </select>
            <div className="mt-1.5 text-[11px] text-gp-muted">
              {base === "VALOR_BRUTO"
                ? "A comissão incide sobre o total faturado da venda."
                : "A comissão incide sobre o lucro (preço de venda − preço de custo)."}
            </div>
          </Campo>

          <div className="grid grid-cols-2 gap-3">
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
            <div className="mt-1.5 text-[11px] text-gp-muted">
              Acréscimo aplicado sobre a comissão calculada quando o vendedor bate a meta.
            </div>
          </Campo>

          <Divider />

          <label className="flex items-center gap-2.5 cursor-pointer">
            <Switch ativo={ativo} onClick={() => setAtivo(!ativo)} />
            <div>
              <div className="text-gp-white text-[13px] font-semibold">
                Configuração ativa
              </div>
              <div className="text-gp-muted text-[11px]">
                Quando inativa, o sistema não calcula comissão para este vendedor.
              </div>
            </div>
          </label>

          <div className="mt-[18px] flex gap-2.5 justify-end">
            <button
              type="button"
              onClick={salvar}
              disabled={!vendedorId || salvando}
              style={btnPrimarioStyle}
            >
              {salvando ? "Salvando..." : (temConfig ? "💾 Salvar alterações" : "✨ Criar configuração")}
            </button>
          </div>
        </div>

        {/* Coluna direita: simulacao */}
        <div className="grid gap-4">
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
            vendedor={vendedorSelecionado || null}
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

interface SimulacaoCardProps {
  vendaSimulada: string;
  setVendaSimulada: (v: string) => void;
  margemSimulada: string;
  setMargemSimulada: (v: string) => void;
  base: BaseComissao;
  tipo: TipoComissao;
  simulacao: SimulacaoResult;
  valor: string;
  metaMensal: string;
  bonusPorMeta: string;
  vendedor: VendedorComissao | null;
}

function SimulacaoCard({
  vendaSimulada, setVendaSimulada,
  margemSimulada, setMargemSimulada,
  base, tipo, simulacao, valor, metaMensal, bonusPorMeta, vendedor,
}: SimulacaoCardProps) {
  const venda = Number(vendaSimulada) || 0;
  const meta = Number(metaMensal) || 0;
  const progresso = meta > 0 ? Math.min(100, (venda / meta) * 100) : 0;

  return (
    <div
      style={{
        ...cardStyle,
        background: `linear-gradient(135deg, ${C.accent}11, ${C.purple}11)`,
        borderColor: C.accent + "55",
      }}
    >
      <div style={cardHeaderStyle}>
        <span className="text-lg">🧮</span>
        <div>
          <div style={cardTituloStyle}>Simulação em tempo real</div>
          <div style={cardSubtituloStyle}>
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
          <div className="mt-1.5 text-[11px] text-gp-muted">
            Lucro estimado = Venda × Margem. Em produção, vem do preço de custo de cada item.
          </div>
        </Campo>
      )}

      <Divider />

      <div
        className="bg-gp-surface mb-3"
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div
          className="text-[11px] text-gp-muted font-semibold uppercase"
          style={{ letterSpacing: 0.4 }}
        >
          Comissão estimada
        </div>
        <div
          className="text-[32px] font-extrabold text-gp-green mt-1"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {fmtBRL(simulacao.total)}
        </div>
        <div
          className="text-xs text-gp-muted mt-1.5"
          style={{ lineHeight: 1.5 }}
        >
          Se o vendedor vender <strong className="text-gp-white">{fmtBRL(venda)}</strong>,
          {" "}ele receberá <strong className="text-gp-green">{fmtBRL(simulacao.total)}</strong> de comissão.
        </div>
      </div>

      <div className="grid gap-2 text-xs">
        <LinhaResumo
          label={base === "LUCRO_LIQUIDO" ? "Base (lucro)" : "Base (valor bruto)"}
          valor={fmtBRL(simulacao.baseCalc)}
        />
        <LinhaResumo
          label={tipo === "PORCENTAGEM" ? `Comissão (${valor || 0}%)` : "Comissão (valor fixo)"}
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

      {meta > 0 && (
        <div className="mt-3.5">
          <div className="flex justify-between text-[11px] text-gp-muted mb-1.5">
            <span>Meta: {fmtBRL(meta)}</span>
            <span
              className="font-bold"
              style={{ color: simulacao.atingiuMeta ? C.green : C.muted }}
            >
              {progresso.toFixed(0)}%{simulacao.atingiuMeta ? " ✓" : ""}
            </span>
          </div>
          <div
            className="overflow-hidden"
            style={{
              height: 8,
              background: C.bg,
              borderRadius: 999,
              border: `1px solid ${C.border}`,
            }}
          >
            <div
              className="h-full"
              style={{
                width: `${progresso}%`,
                background: simulacao.atingiuMeta
                  ? `linear-gradient(90deg, ${C.green}, ${C.accent})`
                  : `linear-gradient(90deg, ${C.accent}, ${C.purple})`,
                transition: "width 0.25s ease",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface ResumoRegrasCardProps {
  tipo: TipoComissao;
  base: BaseComissao;
  valor: string;
  metaMensal: string;
  bonusPorMeta: string;
}

function ResumoRegrasCard({ tipo, base, valor, metaMensal, bonusPorMeta }: ResumoRegrasCardProps) {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <span className="text-lg">📋</span>
        <div>
          <div style={cardTituloStyle}>Regra atual</div>
          <div style={cardSubtituloStyle}>Resumo legível da configuração</div>
        </div>
      </div>
      <ul
        className="grid gap-2.5"
        style={{ listStyle: "none", padding: 0, margin: 0 }}
      >
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

function ItemRegra({ icone, texto }: { icone: string; texto: ReactNode }) {
  return (
    <li
      className="flex gap-2.5 items-start bg-gp-surface text-gp-text text-xs"
      style={{
        padding: "10px 12px",
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        lineHeight: 1.5,
      }}
    >
      <span className="text-sm" style={{ lineHeight: 1.2 }}>{icone}</span>
      <span className="flex-1">{texto}</span>
    </li>
  );
}

interface LinhaResumoProps {
  label: string;
  valor: string;
  destaque?: string;
}

function LinhaResumo({ label, valor, destaque }: LinhaResumoProps) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gp-muted">{label}</span>
      <span
        className="font-bold"
        style={{ color: destaque || C.text, fontVariantNumeric: "tabular-nums" }}
      >
        {valor}
      </span>
    </div>
  );
}

function Campo({ label, icone, children }: { label: string; icone?: string; children: ReactNode }) {
  return (
    <div className="mb-3.5">
      <label className="flex items-center gap-1.5 text-gp-muted text-xs mb-1.5 font-semibold">
        {icone && <span>{icone}</span>}
        <span>{label}</span>
      </label>
      {children}
    </div>
  );
}

interface RadioCardProps {
  ativo: boolean;
  onClick: () => void;
  icone: string;
  titulo: string;
  descricao: string;
}

function RadioCard({ ativo, onClick, icone, titulo, descricao }: RadioCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 min-w-0 text-left cursor-pointer rounded-[10px] flex items-center gap-3"
      style={{
        background: ativo ? C.accent + "1a" : C.surface,
        border: `1px solid ${ativo ? C.accent : C.border}`,
        padding: "12px 14px",
        transition: "background 0.15s ease, border-color 0.15s ease",
      }}
    >
      <div
        className="flex items-center justify-center flex-shrink-0 font-extrabold text-sm"
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: ativo ? C.accent : C.card,
          color: ativo ? C.white : C.muted,
        }}
      >
        {icone}
      </div>
      <div className="min-w-0">
        <div
          className="text-[13px] font-bold"
          style={{ color: ativo ? C.white : C.text }}
        >
          {titulo}
        </div>
        <div className="text-gp-muted text-[11px] mt-0.5">
          {descricao}
        </div>
      </div>
    </button>
  );
}

interface InputNumeroProps {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
  sufixo?: string;
}

function InputNumero({ value, onChange, min, max, step = 1, sufixo }: InputNumeroProps) {
  return (
    <div className="relative">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        step={step}
        aria-label={sufixo ? `Valor em ${sufixo}` : undefined}
        style={{ ...inputStyle, paddingRight: sufixo ? 48 : 12 }}
      />
      {sufixo && (
        <span
          className="absolute text-[11px] font-bold text-gp-muted pointer-events-none"
          style={{ right: 12, top: "50%", transform: "translateY(-50%)" }}
        >
          {sufixo}
        </span>
      )}
    </div>
  );
}

function Switch({ ativo, onClick }: { ativo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ativo ? "Desativar" : "Ativar"}
      className="relative border-none cursor-pointer flex-shrink-0"
      style={{
        width: 38,
        height: 22,
        borderRadius: 999,
        background: ativo ? C.accent : C.border,
        transition: "background 0.15s ease",
      }}
    >
      <span
        className="absolute rounded-full"
        style={{
          top: 3,
          left: ativo ? 19 : 3,
          width: 16,
          height: 16,
          background: C.white,
          transition: "left 0.15s ease",
        }}
      />
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: C.border, margin: "16px 0" }} />;
}

// ============ ESTILOS ============

const cardStyle: CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: 20,
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 16,
};

const cardTituloStyle: CSSProperties = {
  color: C.white,
  fontWeight: 700,
  fontSize: 15,
  lineHeight: 1.2,
};

const cardSubtituloStyle: CSSProperties = {
  color: C.muted,
  fontSize: 11,
  marginTop: 2,
};

const cardVazioStyle: CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: 30,
  textAlign: "center",
  color: C.muted,
  fontSize: 14,
};

const inputStyle: CSSProperties = {
  width: "100%",
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "10px 12px",
  color: C.text,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

const btnPrimarioStyle: CSSProperties = {
  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
  color: "var(--accent-ink)",
  border: "none",
  borderRadius: 8,
  padding: "10px 22px",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const alertSucessoStyle: CSSProperties = {
  marginBottom: 12,
  padding: "10px 14px",
  borderRadius: 8,
  background: C.green + "22",
  border: `1px solid ${C.green}55`,
  color: C.green,
  fontSize: 13,
};

const alertErroStyle: CSSProperties = {
  marginBottom: 12,
  padding: "10px 14px",
  borderRadius: 8,
  background: C.red + "22",
  border: `1px solid ${C.red}55`,
  color: C.red,
  fontSize: 13,
};
