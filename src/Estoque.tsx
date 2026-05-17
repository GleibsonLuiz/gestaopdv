import { useEffect, useState, useCallback, type CSSProperties } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser } from "./lib/api";
import MovimentarEstoqueModal from "./MovimentarEstoqueModal";
import SelectBusca from "./components/SelectBusca";

// ============ TIPOS ============

type TipoMov = "ENTRADA" | "SAIDA" | "AJUSTE";

interface TipoInfo {
  label: string;
  icone: string;
  cor: string;
}

const TIPO_INFO: Record<TipoMov, TipoInfo> = {
  ENTRADA: { label: "Entrada", icone: "↗", cor: C.green },
  SAIDA:   { label: "Saída",   icone: "↙", cor: C.red },
  AJUSTE:  { label: "Ajuste",  icone: "✎", cor: C.yellow },
};

interface Produto {
  id: string;
  codigo: string;
  nome: string;
  estoque: number;
  tipoItem?: "PRODUTO" | "SERVICO";
  [extra: string]: unknown;
}

interface ProdutoRef {
  nome: string;
  codigo: string;
}

interface UserRef {
  nome?: string;
}

interface Movimentacao {
  id: string;
  createdAt: string;
  tipo: TipoMov;
  quantidade: number;
  estoqueAntes: number;
  estoqueDepois: number;
  motivo?: string | null;
  produto?: ProdutoRef | null;
  user?: UserRef | null;
}

const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

// ============ COMPONENTE PRINCIPAL ============

interface EstoqueProps {
  user: SessionUser;
}

export default function Estoque({ user }: EstoqueProps) {
  const [movs, setMovs] = useState<Movimentacao[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [filtroProduto, setFiltroProduto] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [produtoSelecionado] = useState<Produto | null>(null);
  const [mensagem, setMensagem] = useState("");

  const podeMovimentar = user.role === "ADMIN" || user.role === "GERENTE";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await api.listarMovimentacoes({
        produtoId: filtroProduto,
        tipo: filtroTipo,
        limite: "200",
      }) as Movimentacao[];
      setMovs(data || []);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [filtroProduto, filtroTipo]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    api.listarProdutos({ ativo: "true" })
      .then((r) => setProdutos((r as Produto[]) || []))
      .catch(() => {});
  }, []);

  function flash(t: string) {
    setMensagem(t);
    setTimeout(() => setMensagem(""), 2500);
  }

  function abrirModal() {
    setModalAberto(true);
  }

  function aposSalvar(mov: unknown) {
    const m = mov as Movimentacao;
    setModalAberto(false);
    flash(`${TIPO_INFO[m.tipo].label} registrada (estoque: ${m.estoqueAntes} → ${m.estoqueDepois})`);
    carregar();
  }

  return (
    <div>
      <div className="flex gap-2.5 mb-4 flex-wrap items-center">
        <SelectBusca<Produto>
          opcoes={produtos}
          value={filtroProduto}
          onChange={setFiltroProduto}
          labelFn={(p) => `${p.codigo} — ${p.nome}`}
          placeholder="Todos os produtos"
          containerStyle={{ flex: "3 1 380px" }}
          style={selectBuscaStyle}
        />
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          aria-label="Filtrar por tipo"
          className="bg-gp-surface text-gp-text rounded-lg text-[13px] cursor-pointer"
          style={{ border: `1px solid ${C.border}`, padding: "10px 12px" }}
        >
          <option value="">Todos os tipos</option>
          <option value="ENTRADA">Entrada</option>
          <option value="SAIDA">Saída</option>
          <option value="AJUSTE">Ajuste</option>
        </select>
        {podeMovimentar && (
          <button
            type="button"
            onClick={abrirModal}
            className="text-gp-white border-none rounded-lg text-sm font-bold cursor-pointer"
            style={{
              background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              padding: "10px 18px",
            }}
          >
            + Nova movimentação
          </button>
        )}
      </div>

      {mensagem && (
        <div
          className="mb-3 px-[14px] py-[10px] rounded-lg text-[13px] text-gp-green"
          style={{ background: C.green + "22", border: `1px solid ${C.green}55` }}
        >
          {mensagem}
        </div>
      )}
      {erro && (
        <div
          className="mb-3 px-[14px] py-[10px] rounded-lg text-[13px] text-gp-red"
          style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}
        >
          {erro}
        </div>
      )}

      <div
        className="bg-gp-card rounded-xl overflow-hidden"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div
          className="grid bg-gp-surface text-gp-muted text-xs font-bold uppercase"
          style={{
            gridTemplateColumns: "150px 100px 1.5fr 100px 160px 1fr 130px",
            padding: "12px 16px",
            borderBottom: `1px solid ${C.border}`,
            letterSpacing: 0.5,
          }}
        >
          <div>Quando</div>
          <div>Tipo</div>
          <div>Produto</div>
          <div className="text-right">Quantidade</div>
          <div className="text-right">Estoque (antes → depois)</div>
          <div>Motivo</div>
          <div>Usuário</div>
        </div>

        {carregando ? (
          <div className="py-[30px] text-center text-gp-muted text-[13px]">Carregando...</div>
        ) : movs.length === 0 ? (
          <div className="py-[30px] text-center text-gp-muted text-[13px]">Nenhuma movimentação encontrada.</div>
        ) : movs.map((m) => {
          const t = TIPO_INFO[m.tipo];
          return (
            <div
              key={m.id}
              className="grid items-center text-[13px]"
              style={{
                gridTemplateColumns: "150px 100px 1.5fr 100px 160px 1fr 130px",
                padding: "12px 16px",
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <div className="text-gp-muted text-xs">{fmtData(m.createdAt)}</div>
              <div>
                <span
                  className="text-[11px] font-bold rounded-md"
                  style={{
                    padding: "3px 8px",
                    background: t.cor + "22",
                    color: t.cor,
                    border: `1px solid ${t.cor}55`,
                  }}
                >
                  {t.icone} {t.label}
                </span>
              </div>
              <div>
                <div className="text-gp-white font-semibold text-[13px]">{m.produto?.nome}</div>
                <div className="text-gp-muted font-mono text-[11px]">{m.produto?.codigo}</div>
              </div>
              <div
                className="text-right font-bold"
                style={{ color: t.cor }}
              >
                {m.tipo === "SAIDA" ? "-" : m.tipo === "ENTRADA" ? "+" : ""}{m.quantidade}
              </div>
              <div className="text-right text-gp-text font-mono text-xs">
                {m.estoqueAntes} → <span className="text-gp-white font-bold">{m.estoqueDepois}</span>
              </div>
              <div className="text-gp-muted text-xs">{m.motivo || "—"}</div>
              <div className="text-gp-muted text-xs">{m.user?.nome || "—"}</div>
            </div>
          );
        })}
      </div>

      {modalAberto && (
        <MovimentarEstoqueModal
          produtos={produtos}
          produtoInicial={produtoSelecionado}
          onCancelar={() => setModalAberto(false)}
          onSalvar={aposSalvar}
        />
      )}
    </div>
  );
}

const selectBuscaStyle: CSSProperties = {
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
