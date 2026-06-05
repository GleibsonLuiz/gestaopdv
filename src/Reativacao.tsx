import { useEffect, useState, useCallback, type CSSProperties, type ReactNode } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";
import { ignorarErro } from "./lib/erroSilencioso";
import BotoesContatoCliente from "./components/BotoesContatoCliente";
import type { TipoMensagem } from "./lib/templates";

// ============ CONFIGURACAO ============

interface MesItem {
  num: number;
  nome: string;
  abrev: string;
}

const MESES: MesItem[] = [
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

const fmtBRL = (v: number | string | null | undefined): string =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
};

// ============ TIPOS ============

type Aba = "aniversariantes" | "reativacao";

interface Tag {
  id: string;
  nome: string;
  cor: string;
}

interface Template {
  id: string;
  nome: string;
  corpo: string;
  assunto?: string;
  tipo: TipoMensagem;
  ativo: boolean;
}

interface ClienteAniversariante {
  id: string;
  nome: string;
  diaNascimento: number;
  mesNascimento: number;
  idade: number;
  cidade?: string;
  estado?: string;
  telefone?: string;
  email?: string;
  tags?: Tag[];
  [extra: string]: unknown;
}

interface ClienteReativacao {
  id: string;
  nome: string;
  cidade?: string;
  estado?: string;
  telefone?: string;
  email?: string;
  ultimaCompra: string | null;
  recenciaDias: number;
  qtdCompras: number;
  ltv: number;
  tags?: Tag[];
  [extra: string]: unknown;
}

interface DadosAniversariantes {
  total: number;
  clientes: ClienteAniversariante[];
}

interface DadosReativacao {
  total: number;
  totalLtv: number;
  clientes: ClienteReativacao[];
}

interface ReativacaoProps {
  user?: unknown;
}

// ============ COMPONENTE PRINCIPAL ============

export default function Reativacao({ user }: ReativacaoProps) {
  const [aba, setAba] = useState<Aba>("aniversariantes");
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    api.listarTemplates({ ativo: "true" })
      .then((t) => setTemplates((t as Template[]) || []))
      .catch(ignorarErro("templates", () => setTemplates([])));
  }, []);

  return (
    <div className="p-4 text-gp-text">
      <div className="mb-4">
        <h2 className="m-0 text-gp-white text-[22px] font-bold">
          🎂 Aniversariantes e Reativação
        </h2>
        <div className="text-gp-muted text-[13px] mt-[2px]">
          Listas prontas para abordagem proativa — converse com clientes nos momentos certos
        </div>
      </div>

      {/* Abas */}
      <div
        className="flex gap-1 mb-4"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
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

interface BotaoAbaProps {
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
}

function BotaoAba({ ativo, onClick, children }: BotaoAbaProps) {
  return (
    <button
      onClick={onClick}
      className="bg-transparent border-none px-4 py-[10px] text-[13px] cursor-pointer"
      style={{
        color: ativo ? C.accent : C.muted,
        borderBottom: `2px solid ${ativo ? C.accent : "transparent"}`,
        fontWeight: ativo ? 700 : 500,
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

// ============ ABA ANIVERSARIANTES ============

interface AbaSubProps {
  user?: unknown;
  templates: Template[];
}

function AbaAniversariantes({ templates }: AbaSubProps) {
  const [mes, setMes] = useState<number>(new Date().getMonth() + 1);
  const [dados, setDados] = useState<DadosAniversariantes | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await api.aniversariantes({ mes: String(mes) }) as DadosAniversariantes;
      setDados(r);
    } catch (e) {
      setErro((e as Error).message || "Erro ao carregar");
    } finally {
      setCarregando(false);
    }
  }, [mes]);

  useEffect(() => { carregar(); }, [carregar]);

  const hoje = new Date();
  const ehDeHoje = (c: ClienteAniversariante) =>
    c.diaNascimento === hoje.getDate() && c.mesNascimento === hoje.getMonth() + 1;
  const aniversariantesHoje = dados?.clientes?.filter(ehDeHoje) || [];

  return (
    <div>
      {/* Filtros */}
      <div className="flex gap-2 items-center mb-[14px] flex-wrap">
        <select
          value={mes}
          onChange={(e) => setMes(parseInt(e.target.value, 10))}
          aria-label="Filtrar por mês"
          className="bg-gp-card text-gp-text rounded-md px-3 py-2 text-[13px]"
          style={{ border: `1px solid ${C.border}` }}
        >
          {MESES.map((m) => (
            <option key={m.num} value={m.num}>{m.nome}</option>
          ))}
        </select>
        <div className="ml-auto text-gp-muted text-xs">
          {dados ? `${dados.total} aniversariante(s) em ${MESES[mes - 1].nome}` : ""}
        </div>
      </div>

      {erro && (
        <div
          className="px-3 py-2 rounded-md text-xs mb-3 text-gp-red"
          style={{ background: C.red + "22" }}
        >
          {erro}
        </div>
      )}

      {/* Destaque: aniversariantes de hoje */}
      {aniversariantesHoje.length > 0 && (
        <div
          className="rounded-lg p-[14px] mb-[14px]"
          style={{
            background: "#f59e0b11",
            border: "1px solid #f59e0b55",
          }}
        >
          <div
            className="text-xs font-bold uppercase mb-2"
            style={{ color: "#f59e0b", letterSpacing: 0.5 }}
          >
            🎉 Aniversariantes de HOJE
          </div>
          <div className="flex flex-col gap-2">
            {aniversariantesHoje.map((c) => (
              <CardAniversariante key={c.id} cliente={c} templates={templates} destaque />
            ))}
          </div>
        </div>
      )}

      {carregando ? (
        <div className="text-gp-muted py-[30px] text-center">Carregando...</div>
      ) : !dados || dados.clientes.length === 0 ? (
        <div className="text-gp-muted text-center text-[13px] py-10 px-4 bg-gp-surface rounded-lg">
          Nenhum cliente com aniversário em {MESES[mes - 1].nome}.
          {mes === hoje.getMonth() + 1 && " Cadastre datas de nascimento em Clientes para popular essa lista."}
        </div>
      ) : (
        <div
          className="bg-gp-surface rounded-lg overflow-hidden"
          style={{ border: `1px solid ${C.border}` }}
        >
          {dados.clientes.map((c) => (
            <CardAniversariante key={c.id} cliente={c} templates={templates} />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardAniversarianteProps {
  cliente: ClienteAniversariante;
  templates: Template[];
  destaque?: boolean;
}

function CardAniversariante({ cliente, templates, destaque = false }: CardAniversarianteProps) {
  const dataNasc = `${String(cliente.diaNascimento).padStart(2, "0")}/${String(cliente.mesNascimento).padStart(2, "0")}`;
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{
        borderTop: destaque ? "none" : `1px solid ${C.border}`,
        background: destaque ? "transparent" : C.surface,
      }}
    >
      <div
        className="rounded-full flex flex-col items-center justify-center flex-shrink-0 font-bold"
        style={{
          width: 56,
          height: 56,
          background: destaque ? "#f59e0b22" : C.card,
          color: destaque ? "#f59e0b" : C.muted,
        }}
      >
        <div className="text-base leading-none">{dataNasc.split("/")[0]}</div>
        <div className="text-[9px] leading-none mt-0.5">{MESES[cliente.mesNascimento - 1].abrev}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-gp-white font-semibold text-sm">{cliente.nome}</div>
        <div className="text-gp-muted text-[11px] mt-0.5">
          🎂 {dataNasc} · {cliente.idade} anos
          {cliente.cidade && ` · ${cliente.cidade}/${cliente.estado || ""}`}
        </div>
        {cliente.tags && cliente.tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {cliente.tags.map((t) => (
              <span
                key={t.id}
                className="text-[10px] font-bold rounded"
                style={{
                  background: t.cor + "22",
                  color: t.cor,
                  padding: "1px 6px",
                  border: `1px solid ${t.cor}55`,
                }}
              >
                {t.nome}
              </span>
            ))}
          </div>
        )}
      </div>
      <BotoesContatoCliente cliente={cliente} templates={templates} />
    </div>
  );
}

// ============ ABA REATIVACAO ============

function AbaReativacao({ templates }: AbaSubProps) {
  const [diasMin, setDiasMin] = useState<number>(90);
  const [dados, setDados] = useState<DadosReativacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await api.clientesReativacao({ diasMin: String(diasMin) }) as DadosReativacao;
      setDados(r);
    } catch (e) {
      setErro((e as Error).message || "Erro ao carregar");
    } finally {
      setCarregando(false);
    }
  }, [diasMin]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div>
      {/* Filtros + KPIs */}
      <div
        className="grid gap-[10px] mb-[14px]"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
      >
        <div
          className="bg-gp-surface rounded-lg px-[14px] py-[10px]"
          style={{
            border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${C.yellow}`,
          }}
        >
          <div className="text-gp-muted text-[11px] uppercase font-semibold" style={{ letterSpacing: 0.5 }}>
            Sem comprar há
          </div>
          <select
            value={diasMin}
            onChange={(e) => setDiasMin(parseInt(e.target.value, 10))}
            aria-label="Período sem compras"
            className="bg-transparent text-gp-white border-none text-lg font-bold mt-1 w-full outline-none cursor-pointer p-0"
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
            <Kpi
              label="Clientes elegíveis"
              valor={String(dados.total)}
              icone="👥"
              cor={C.accent}
              sub="Já compraram antes"
            />
            <Kpi
              label="LTV total em risco"
              valor={fmtBRL(dados.totalLtv)}
              icone="💰"
              cor={C.green}
              sub="Valor histórico desses clientes"
            />
            <Kpi
              label="LTV médio"
              valor={fmtBRL(dados.total > 0 ? dados.totalLtv / dados.total : 0)}
              icone="📊"
              cor="#7c3aed"
            />
          </>
        )}
      </div>

      {erro && (
        <div
          className="px-3 py-2 rounded-md text-xs mb-3 text-gp-red"
          style={{ background: C.red + "22" }}
        >
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="text-gp-muted py-[30px] text-center">Carregando...</div>
      ) : !dados || dados.clientes.length === 0 ? (
        <div className="text-gp-muted text-center text-[13px] py-10 px-4 bg-gp-surface rounded-lg">
          🎉 Nenhum cliente precisando de reativação com esse critério.
        </div>
      ) : (
        <div
          className="bg-gp-surface rounded-lg overflow-hidden"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr
                  className="text-gp-muted text-[11px] uppercase"
                  style={{ background: C.bg, letterSpacing: 0.5 }}
                >
                  <th style={thStyle}>Cliente</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Última compra</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Dias sem comprar</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Compras</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>LTV</th>
                  <th style={thStyle}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {dados.clientes.map((c) => (
                  <tr key={c.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={tdStyle}>
                      <div className="text-gp-white font-semibold">{c.nome}</div>
                      <div className="text-gp-muted text-[11px]">
                        {[c.cidade, c.estado].filter(Boolean).join("/")}
                        {c.telefone && ` · ${c.telefone}`}
                      </div>
                      {c.tags && c.tags.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {c.tags.map((t) => (
                            <span
                              key={t.id}
                              className="text-[10px] font-bold rounded"
                              style={{
                                background: t.cor + "22",
                                color: t.cor,
                                padding: "1px 6px",
                              }}
                            >
                              {t.nome}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }} className="text-gp-muted text-xs">
                      {fmtData(c.ultimaCompra)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <span
                        className="text-[11px] font-bold rounded"
                        style={{
                          background: c.recenciaDias > 180 ? C.red + "22" : C.yellow + "22",
                          color: c.recenciaDias > 180 ? C.red : C.yellow,
                          padding: "3px 10px",
                        }}
                      >
                        {c.recenciaDias}d
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }} className="text-gp-text">{c.qtdCompras}</td>
                    <td
                      style={{ ...tdStyle, textAlign: "right" }}
                      className="text-gp-green font-bold"
                    >
                      {fmtBRL(c.ltv)}
                    </td>
                    <td style={tdStyle}>
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

interface KpiProps {
  label: string;
  valor: string;
  icone: string;
  cor: string;
  sub?: string;
}

function Kpi({ label, valor, icone, cor, sub }: KpiProps) {
  return (
    <div
      className="bg-gp-surface rounded-lg px-[14px] py-[10px]"
      style={{
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${cor}`,
      }}
    >
      <div
        className="flex items-center gap-[6px] text-gp-muted text-[11px] uppercase font-semibold"
        style={{ letterSpacing: 0.5 }}
      >
        <span>{icone}</span> {label}
      </div>
      <div className="text-gp-white text-lg font-bold mt-1">{valor}</div>
      {sub && <div className="text-gp-muted text-[11px] mt-0.5">{sub}</div>}
    </div>
  );
}

const thStyle: CSSProperties = { padding: "10px 12px", textAlign: "left", fontWeight: 700 };
const tdStyle: CSSProperties = { padding: "10px 12px", verticalAlign: "middle" };
