import { useEffect, useState, useCallback, lazy, Suspense, type CSSProperties, type FormEvent } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser } from "./lib/api";
import ActionsMenu from "./components/ActionsMenu";
import QrMobileModal from "./components/QrMobileModal";
import { gerarFolhaCegaPdf, type FolhaCegaPayload, type EmpresaParaCabecalho } from "./lib/folhaCegaPdf";
import { ignorarErro } from "./lib/erroSilencioso";
import { obterConfiguracaoCache } from "./HeaderRelatorio";

// Lazy: a folha de contagem so e carregada quando o usuario clica em
// "Contar". Mesmo principio vale para o detalhe (gestor) — mantem o
// chunk de listagem leve.
const InventarioContagem = lazy(() => import("./InventarioContagem"));
const InventarioDetalhe = lazy(() => import("./InventarioDetalhe"));

// ============ TIPOS ============

type StatusInventario = "ABERTO" | "CONCLUIDO" | "CANCELADO";

interface ResponsavelRef {
  id: string;
  nome: string;
}

interface Categoria {
  id: string;
  nome: string;
}

interface Inventario {
  id: string;
  numero: number;
  descricao?: string | null;
  observacoes?: string | null;
  filtroCategoria?: string | null;
  status: StatusInventario;
  dataInicio: string;
  dataFim?: string | null;
  responsavel?: ResponsavelRef | null;
  _count?: { itens: number };
}

// ============ HELPERS ============

const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const STATUS_META: Record<StatusInventario, { label: string; cor: string }> = {
  ABERTO: { label: "Em contagem", cor: C.yellow },
  CONCLUIDO: { label: "Concluído", cor: C.green },
  CANCELADO: { label: "Cancelado", cor: C.red },
};

function StatusPill({ status }: { status: StatusInventario }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="text-[11px] font-bold uppercase rounded-full inline-block"
      style={{
        background: meta.cor + "22",
        border: `1px solid ${meta.cor}55`,
        color: meta.cor,
        padding: "3px 10px",
        letterSpacing: 0.5,
      }}
    >
      {meta.label}
    </span>
  );
}

// ============ COMPONENTE PRINCIPAL ============

interface InventarioProps {
  user: SessionUser;
}

export default function Inventario({ user }: InventarioProps) {
  const [inventarios, setInventarios] = useState<Inventario[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"" | StatusInventario>("");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [novoAberto, setNovoAberto] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [qrAberto, setQrAberto] = useState(false);
  const [qrInv, setQrInv] = useState<{ id: string; numero: number } | null>(null);
  // Se setado, renderiza a folha de contagem em vez da listagem.
  const [contandoId, setContandoId] = useState<string | null>(null);
  // Se setado, renderiza o detalhe do gestor em vez da listagem.
  const [detalhandoId, setDetalhandoId] = useState<string | null>(null);

  const podeGerir = user.role === "ADMIN" || user.role === "GERENTE";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await api.listarInventarios({ status: filtroStatus }) as Inventario[];
      setInventarios(data || []);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [filtroStatus]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    api.listarCategorias().then((r) => setCategorias((r as Categoria[]) || [])).catch(ignorarErro("categorias"));
  }, []);

  function flash(t: string) {
    setMensagem(t);
    setTimeout(() => setMensagem(""), 3500);
  }

  async function cancelar(inv: Inventario) {
    if (!confirm(`Cancelar inventário #${inv.numero}? A contagem em andamento será descartada.`)) return;
    try {
      await api.cancelarInventario(inv.id);
      flash(`Inventário #${inv.numero} cancelado`);
      carregar();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  // Imprime a folha de contagem cega (PDF paisagem). Busca a folha + dados
  // da empresa em paralelo e dispara o download. Erro nao bloqueia a UI —
  // mostra alerta com a mensagem do backend.
  async function imprimirFolha(inv: Inventario) {
    try {
      flash(`Gerando folha #${inv.numero}…`);
      // ConfiguracaoEmpresa traz razaoSocial/nomeFantasia/cnpj/logotipo
      // — /empresa (tenant) nao tem logotipo, entao usamos o cache de config.
      const [folha, empresa] = await Promise.all([
        api.folhaInventario(inv.id) as Promise<FolhaCegaPayload>,
        obterConfiguracaoCache() as Promise<EmpresaParaCabecalho | null>,
      ]);
      await gerarFolhaCegaPdf(folha, empresa);
    } catch (err) {
      alert(`Falha ao gerar folha: ${(err as Error).message}`);
    }
  }

  if (contandoId) {
    return (
      <Suspense fallback={<div className="py-10 text-center text-gp-muted text-[13px]">Carregando folha de contagem...</div>}>
        <InventarioContagem
          inventarioId={contandoId}
          onVoltar={() => { setContandoId(null); carregar(); }}
        />
      </Suspense>
    );
  }

  if (detalhandoId) {
    return (
      <Suspense fallback={<div className="py-10 text-center text-gp-muted text-[13px]">Carregando detalhe do inventário...</div>}>
        <InventarioDetalhe
          inventarioId={detalhandoId}
          user={user}
          onVoltar={(msg) => {
            setDetalhandoId(null);
            if (msg) flash(msg);
            carregar();
          }}
        />
      </Suspense>
    );
  }

  return (
    <div>
      <div className="flex gap-2.5 mb-4 flex-wrap items-center">
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value as "" | StatusInventario)}
          aria-label="Filtrar por status"
          style={inputCompactoStyle}
        >
          <option value="">Todos os status</option>
          <option value="ABERTO">Em contagem</option>
          <option value="CONCLUIDO">Concluído</option>
          <option value="CANCELADO">Cancelado</option>
        </select>
        {filtroStatus && (
          <button
            type="button"
            onClick={() => setFiltroStatus("")}
            className="bg-gp-surface text-gp-muted rounded-lg text-xs cursor-pointer"
            style={{
              border: `1px solid ${C.border}`,
              padding: "8px 14px",
            }}
          >
            Limpar filtros
          </button>
        )}
        {podeGerir && (
          <button
            type="button"
            onClick={() => setNovoAberto(true)}
            className="ml-auto text-gp-white border-none rounded-lg text-sm font-bold cursor-pointer"
            style={{
              background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              padding: "10px 18px",
            }}
          >
            + Novo Inventário
          </button>
        )}
      </div>

      {/* ETAPA#1: aviso da versao mobile (PWA) — operador pode contar no celular */}
      <div
        className="mb-3 px-[14px] py-[10px] rounded-lg text-[12.5px] flex items-center justify-between gap-3 flex-wrap"
        style={{ background: C.accent + "12", border: `1px solid ${C.accent}55`, color: C.text }}
      >
        <div>
          📱 <b>Inventário no celular?</b> Escaneie o QR Code com o celular ou instale como PWA. Funciona offline, com leitor de código de barras.
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setQrAberto(true)}
            className="text-xs font-bold"
            style={{ color: C.white, background: C.accent, padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer" }}
          >📱 QR Code</button>
          <a
            href="?mobile=inventario"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold no-underline"
            style={{ color: C.accent, padding: "5px 10px", border: `1px solid ${C.accent}55`, borderRadius: 6 }}
          >Abrir aqui</a>
        </div>
      </div>

      <QrMobileModal aberto={qrAberto} onFechar={() => setQrAberto(false)} />
      <QrMobileModal
        aberto={qrInv !== null}
        onFechar={() => setQrInv(null)}
        inventarioId={qrInv?.id}
        inventarioNumero={qrInv?.numero}
      />

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
            gridTemplateColumns: "150px 80px 2fr 130px 100px 130px 80px",
            padding: "12px 16px",
            borderBottom: `1px solid ${C.border}`,
            letterSpacing: 0.5,
          }}
        >
          <div>Abertura</div>
          <div>Nº</div>
          <div>Descrição</div>
          <div>Responsável</div>
          <div className="text-right">Itens</div>
          <div>Status</div>
          <div className="text-right">Ações</div>
        </div>

        {carregando ? (
          <div className="py-[30px] text-center text-gp-muted text-[13px]">Carregando...</div>
        ) : inventarios.length === 0 ? (
          <div className="py-[30px] text-center text-gp-muted text-[13px]">
            Nenhum inventário encontrado.{podeGerir && " Clique em \"+ Novo Inventário\" para começar."}
          </div>
        ) : inventarios.map((inv) => (
          <div
            key={inv.id}
            className="grid items-center text-[13px]"
            style={{
              gridTemplateColumns: "150px 80px 2fr 130px 100px 130px 80px",
              padding: "12px 16px",
              borderBottom: `1px solid ${C.border}`,
              opacity: inv.status === "CANCELADO" ? 0.6 : 1,
            }}
          >
            <div className="text-gp-muted text-xs">{fmtData(inv.dataInicio)}</div>
            <div className="text-gp-white font-mono font-bold">#{inv.numero}</div>
            <div>
              <div className="text-gp-white font-semibold">
                {inv.descricao || (inv.filtroCategoria ? `Categoria: ${inv.filtroCategoria}` : "Inventário geral")}
              </div>
              {inv.filtroCategoria && inv.descricao && (
                <div className="text-gp-muted text-[11px]">Categoria: {inv.filtroCategoria}</div>
              )}
            </div>
            <div className="text-gp-text text-xs">{inv.responsavel?.nome || "—"}</div>
            <div className="text-right text-gp-text">{inv._count?.itens ?? "—"}</div>
            <div><StatusPill status={inv.status} /></div>
            <div className="flex justify-end">
              <ActionsMenu
                items={[
                  ...(inv.status === "ABERTO"
                    ? [
                        {
                          label: "Contar (folha cega)",
                          icon: "📋",
                          color: C.accent,
                          onClick: () => setContandoId(inv.id),
                        },
                        {
                          label: "Imprimir folha cega",
                          icon: "🖨",
                          color: C.muted,
                          onClick: () => imprimirFolha(inv),
                        },
                        {
                          label: "QR para contagem mobile",
                          icon: "📱",
                          color: C.accent,
                          onClick: () => setQrInv({ id: inv.id, numero: inv.numero }),
                        },
                        ...(podeGerir
                          ? [
                              {
                                label: "Ver divergências",
                                icon: "👁",
                                color: C.yellow,
                                onClick: () => setDetalhandoId(inv.id),
                              },
                              {
                                label: "Cancelar inventário",
                                icon: "🗑",
                                color: C.red,
                                onClick: () => cancelar(inv),
                              },
                            ]
                          : []),
                      ]
                    : [
                        {
                          label: "Ver detalhes",
                          icon: "👁",
                          color: C.accent,
                          onClick: () => setDetalhandoId(inv.id),
                        },
                      ]),
                ]}
              />
            </div>
          </div>
        ))}
      </div>

      {novoAberto && (
        <NovoInventarioModal
          categorias={categorias}
          onCancelar={() => setNovoAberto(false)}
          onSalvar={(inv) => {
            setNovoAberto(false);
            const qtd = inv._count?.itens || 0;
            flash(`Inventário #${inv.numero} aberto com ${qtd} item(s) snapshotado(s)`);
            carregar();
          }}
        />
      )}
    </div>
  );
}

// ============ MODAL NOVO INVENTARIO ============

interface NovoInventarioModalProps {
  categorias: Categoria[];
  onCancelar: () => void;
  onSalvar: (inv: Inventario) => void;
}

function NovoInventarioModal({ categorias, onCancelar, onSalvar }: NovoInventarioModalProps) {
  const [descricao, setDescricao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [somenteAtivos, setSomenteAtivos] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      const payload: Record<string, unknown> = {
        somenteAtivos,
      };
      if (descricao.trim()) payload.descricao = descricao.trim();
      if (observacoes.trim()) payload.observacoes = observacoes.trim();
      if (categoriaId) payload.categoriaId = categoriaId;
      const inv = await api.abrirInventario(payload) as Inventario;
      onSalvar(inv);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onCancelar()} style={modalOverlayStyle}>
      <form
        onSubmit={salvar}
        onClick={(e) => e.stopPropagation()}
        style={{ ...modalCardStyle, maxWidth: 600 }}
      >
        <div style={modalHeaderStyle}>
          <div>
            <div className="text-gp-white font-bold text-lg">Novo Inventário</div>
            <div className="text-gp-muted text-xs mt-1">
              Será tirado um snapshot do estoque atual. A contagem é cega: o operador não vê o estoque do sistema.
            </div>
          </div>
          <button type="button" onClick={onCancelar} aria-label="Fechar" style={btnFecharStyle}>×</button>
        </div>

        <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "1fr" }}>
          <Campo label="Descrição">
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Inventário mensal de papelaria"
              style={inputStyle}
            />
          </Campo>
          <Campo label="Categoria (opcional — filtra os produtos do snapshot)">
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              aria-label="Categoria do snapshot"
              style={inputStyle}
            >
              <option value="">Todas as categorias</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Observações">
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Notas internas para o relatório (opcional)"
              rows={3}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
          </Campo>
        </div>

        <div
          className="p-3.5 mb-3.5"
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
          }}
        >
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={somenteAtivos}
              onChange={(e) => setSomenteAtivos(e.target.checked)}
              style={{ marginTop: 3, transform: "scale(1.2)", accentColor: C.accent }}
            />
            <div className="flex-1">
              <div className="text-gp-white font-bold text-sm">
                Apenas produtos ativos
              </div>
              <div className="text-gp-muted text-[11px] mt-0.5">
                Desmarque para incluir também produtos inativos no snapshot da contagem.
              </div>
            </div>
          </label>
        </div>

        <div
          className="p-3 mb-3.5 rounded-[10px] text-xs"
          style={{
            background: C.yellow + "11",
            border: `1px solid ${C.yellow}55`,
            color: C.text,
          }}
        >
          <div className="font-bold mb-1" style={{ color: C.yellow }}>⚠ Atenção</div>
          Após abrir, qualquer entrada/saída de estoque concorrente NÃO altera o snapshot.
          A consolidação ajusta o estoque para o valor contado (não o estado vigente).
          Use idealmente fora do horário de venda.
        </div>

        {erro && (
          <div
            className="mb-3.5 rounded-lg text-[13px] text-gp-red"
            style={{
              padding: "10px 12px",
              background: C.red + "22",
              border: `1px solid ${C.red}55`,
            }}
          >
            {erro}
          </div>
        )}

        <div className="flex gap-2.5 justify-end">
          <button type="button" onClick={onCancelar} disabled={salvando} style={btnSecundarioStyle}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            style={{ ...btnPrimarioStyle, opacity: salvando ? 0.6 : 1 }}
          >
            {salvando ? "Abrindo..." : "Abrir inventário"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ============ HELPERS UI ============

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-gp-muted text-[11px] font-bold mb-1.5" style={{ letterSpacing: 0.3 }}>
        {label.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

// ============ ESTILOS ============

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

const inputCompactoStyle: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "9px 12px",
  color: C.text,
  fontSize: 13,
  outline: "none",
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 100,
};

const modalCardStyle: CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  width: "100%",
  maxHeight: "92vh",
  overflowY: "auto",
  padding: 24,
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 18,
  gap: 12,
};

const btnFecharStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: C.muted,
  fontSize: 22,
  cursor: "pointer",
  flexShrink: 0,
};

const btnSecundarioStyle: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: 8,
  padding: "10px 18px",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const btnPrimarioStyle: CSSProperties = {
  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
  color: C.white,
  border: "none",
  borderRadius: 8,
  padding: "10px 22px",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};
