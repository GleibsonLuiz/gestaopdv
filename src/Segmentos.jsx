import { useEffect, useMemo, useState, useCallback } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";

// ============ CONFIGURACAO DE SEGMENTOS RFM ============

const SEGMENTOS = [
  { id: "VIP",        label: "VIP",        cor: "#f59e0b", icone: "👑", desc: "Alto valor + frequência + recente" },
  { id: "RECORRENTE", label: "Recorrente", cor: C.green,   icone: "🔄", desc: "Compra com frequência" },
  { id: "NOVO",       label: "Novo",       cor: C.accent,  icone: "🌟", desc: "1ª compra nos últimos 30 dias" },
  { id: "EM_RISCO",   label: "Em risco",   cor: C.yellow,  icone: "⚠️", desc: "Comprava, mas há 90+ dias" },
  { id: "INATIVO",    label: "Inativo",    cor: C.muted,   icone: "💤", desc: "Sem compras há 180+ dias" },
  { id: "PROSPECT",   label: "Prospect",   cor: C.purple,  icone: "🌱", desc: "Cadastrado, nunca comprou" },
];
const SEG_MAP = Object.fromEntries(SEGMENTOS.map((s) => [s.id, s]));

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
};

function whatsappLink(telefone, mensagem) {
  if (!telefone) return null;
  const digits = String(telefone).replace(/\D/g, "");
  if (!digits) return null;
  const numero = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${numero}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ""}`;
}

// ============ COMPONENTE PRINCIPAL ============

export default function Segmentos({ user }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtroSeg, setFiltroSeg] = useState("");
  const [filtroTagId, setFiltroTagId] = useState("");
  const [search, setSearch] = useState("");
  const [janela, setJanela] = useState(365);
  const [tags, setTags] = useState([]);
  const [modalTag, setModalTag] = useState(null); // cliente para gerenciar tags
  const [modalGerirTags, setModalGerirTags] = useState(false);

  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE" || user.role === "VENDEDOR";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [seg, tagsRes] = await Promise.all([
        api.segmentosClientes({ dias: janela }),
        api.listarTags().catch(() => []),
      ]);
      setDados(seg);
      setTags(tagsRes);
    } catch (e) {
      setErro(e.message || "Erro ao carregar segmentos");
    } finally {
      setCarregando(false);
    }
  }, [janela]);

  useEffect(() => { carregar(); }, [carregar]);

  const clientesFiltrados = useMemo(() => {
    if (!dados) return [];
    let lista = dados.clientes;
    if (filtroSeg) lista = lista.filter((c) => c.segmento === filtroSeg);
    if (filtroTagId) lista = lista.filter((c) => c.tags.some((t) => t.id === filtroTagId));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      lista = lista.filter((c) => c.nome.toLowerCase().includes(q));
    }
    // Ordena por valor monetário desc
    return [...lista].sort((a, b) => b.rfm.monetario - a.rfm.monetario);
  }, [dados, filtroSeg, filtroTagId, search]);

  async function toggleTag(clienteId, tagId, ativa) {
    try {
      if (ativa) await api.removerTagCliente(clienteId, tagId);
      else await api.atribuirTagCliente(clienteId, tagId);
      await carregar();
      // Atualiza o cliente no modal se aberto
      if (modalTag && modalTag.id === clienteId) {
        const atualizado = (await api.segmentosClientes({ dias: janela })).clientes
          .find((c) => c.id === clienteId);
        if (atualizado) setModalTag(atualizado);
      }
    } catch (e) {
      alert(e.message || "Erro ao atualizar tag");
    }
  }

  return (
    <div style={{ padding: 16, color: C.text }}>
      <Cabecalho
        dados={dados}
        janela={janela}
        onJanela={setJanela}
        onGerirTags={() => setModalGerirTags(true)}
        podeEditar={podeEditar && (user.role === "ADMIN" || user.role === "GERENTE")}
      />

      {erro && (
        <div style={{
          background: C.red + "22", color: C.red, padding: "10px 14px",
          borderRadius: 8, marginBottom: 12, fontSize: 13,
        }}>{erro}</div>
      )}

      {/* Cards de segmento (clicáveis para filtrar) */}
      {dados && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10, marginBottom: 16,
        }}>
          {SEGMENTOS.map((s) => {
            const r = dados.resumo[s.id] || { quantidade: 0, monetario: 0 };
            const ativo = filtroSeg === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setFiltroSeg(ativo ? "" : s.id)}
                style={{
                  background: ativo ? s.cor + "22" : C.surface,
                  border: `2px solid ${ativo ? s.cor : C.border}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.12s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: s.cor, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>
                  <span style={{ fontSize: 14 }}>{s.icone}</span> {s.label}
                </div>
                <div style={{ color: C.white, fontSize: 22, fontWeight: 800, marginTop: 6, lineHeight: 1 }}>
                  {r.quantidade}
                </div>
                <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
                  {fmtBRL(r.monetario)}
                </div>
                <div style={{ color: C.muted, fontSize: 10, marginTop: 6, fontStyle: "italic" }}>
                  {s.desc}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input
          type="text"
          placeholder="🔍 Buscar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputFiltro(260)}
        />
        <select
          value={filtroTagId}
          onChange={(e) => setFiltroTagId(e.target.value)}
          style={inputFiltro(220)}
        >
          <option value="">Todas as tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.nome} ({t.totalClientes})</option>
          ))}
        </select>
        {(filtroSeg || filtroTagId || search) && (
          <button
            onClick={() => { setFiltroSeg(""); setFiltroTagId(""); setSearch(""); }}
            style={{
              background: "transparent", color: C.muted, border: `1px solid ${C.border}`,
              padding: "8px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
            }}
          >Limpar filtros</button>
        )}
        <div style={{ marginLeft: "auto", color: C.muted, fontSize: 12 }}>
          {clientesFiltrados.length} {clientesFiltrados.length === 1 ? "cliente" : "clientes"}
        </div>
      </div>

      {/* Tabela */}
      {carregando ? (
        <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Calculando segmentação RFM...</div>
      ) : clientesFiltrados.length === 0 ? (
        <div style={{ color: C.muted, padding: 40, textAlign: "center", background: C.surface, borderRadius: 8 }}>
          Nenhum cliente nessa combinação de filtros.
        </div>
      ) : (
        <TabelaClientes
          clientes={clientesFiltrados}
          onAbrirTags={(c) => setModalTag(c)}
          podeEditar={podeEditar}
        />
      )}

      {modalTag && (
        <ModalGerenciarTagsCliente
          cliente={modalTag}
          tags={tags}
          onToggleTag={(tagId, ativa) => toggleTag(modalTag.id, tagId, ativa)}
          onFechar={() => setModalTag(null)}
          onNovaTag={() => { setModalGerirTags(true); }}
          podeEditar={podeEditar}
        />
      )}

      {modalGerirTags && (
        <ModalGerirTags
          tags={tags}
          onFechar={() => setModalGerirTags(false)}
          onMudou={carregar}
          podeEditar={podeEditar && (user.role === "ADMIN" || user.role === "GERENTE")}
          podeExcluir={user.role === "ADMIN"}
        />
      )}
    </div>
  );
}

// ============ CABECALHO ============

function Cabecalho({ dados, janela, onJanela, onGerirTags, podeEditar }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
      <div>
        <h2 style={{ margin: 0, color: C.white, fontSize: 22, fontWeight: 700 }}>
          📊 Segmentação de Clientes (RFM)
        </h2>
        <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
          Classificação automática por Recência, Frequência e Valor monetário
          {dados && ` · janela de ${dados.janelaDias} dias · base de ${dados.clientes.length} clientes ativos`}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          value={janela}
          onChange={(e) => onJanela(parseInt(e.target.value, 10))}
          style={inputFiltro(180)}
        >
          <option value={90}>Últimos 90 dias</option>
          <option value={180}>Últimos 180 dias</option>
          <option value={365}>Últimos 365 dias</option>
          <option value={730}>Últimos 2 anos</option>
        </select>
        {podeEditar && (
          <button
            onClick={onGerirTags}
            style={{
              background: C.card, color: C.text, border: `1px solid ${C.border}`,
              padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13,
            }}
          >🏷️ Gerir Tags</button>
        )}
      </div>
    </div>
  );
}

function inputFiltro(width) {
  return {
    background: C.card, color: C.text, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: "8px 12px", fontSize: 13, width,
  };
}

// ============ TABELA ============

function TabelaClientes({ clientes, onAbrirTags, podeEditar }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.bg, color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
              <th style={th()}>Cliente</th>
              <th style={th()}>Segmento</th>
              <th style={th()}>Tags</th>
              <th style={{ ...th(), textAlign: "right" }}>Total gasto</th>
              <th style={{ ...th(), textAlign: "center" }}>Compras</th>
              <th style={{ ...th(), textAlign: "right" }}>Ticket médio</th>
              <th style={{ ...th(), textAlign: "center" }}>Última compra</th>
              <th style={th()}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => {
              const seg = SEG_MAP[c.segmento];
              const wa = whatsappLink(c.telefone);
              const tel = c.telefone ? `tel:${String(c.telefone).replace(/\D/g, "")}` : null;
              const mail = c.email ? `mailto:${c.email}` : null;
              return (
                <tr key={c.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={td()}>
                    <div style={{ color: C.white, fontWeight: 600 }}>{c.nome}</div>
                    <div style={{ color: C.muted, fontSize: 11 }}>
                      {[c.cidade, c.estado].filter(Boolean).join("/")}
                      {c.telefone && ` · ${c.telefone}`}
                    </div>
                  </td>
                  <td style={td()}>
                    <span style={{
                      background: seg.cor + "22", color: seg.cor,
                      padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                      display: "inline-flex", alignItems: "center", gap: 4,
                    }}>
                      <span>{seg.icone}</span> {seg.label}
                    </span>
                  </td>
                  <td style={td()}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 200 }}>
                      {c.tags.length === 0 && <span style={{ color: C.muted, fontSize: 11 }}>—</span>}
                      {c.tags.map((t) => (
                        <span key={t.id} style={{
                          background: t.cor + "22", color: t.cor,
                          padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                          border: `1px solid ${t.cor}66`,
                        }}>{t.nome}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ ...td(), textAlign: "right", color: C.green, fontWeight: 700 }}>
                    {fmtBRL(c.rfm.monetario)}
                  </td>
                  <td style={{ ...td(), textAlign: "center", color: C.text }}>{c.rfm.frequencia}</td>
                  <td style={{ ...td(), textAlign: "right", color: C.muted }}>
                    {c.rfm.frequencia > 0 ? fmtBRL(c.rfm.ticketMedio) : "—"}
                  </td>
                  <td style={{ ...td(), textAlign: "center", color: C.muted, fontSize: 12 }}>
                    {c.rfm.ultimaCompra ? (
                      <>
                        {fmtData(c.rfm.ultimaCompra)}
                        <div style={{ fontSize: 10, color: c.rfm.recenciaDias > 90 ? C.red : C.muted }}>
                          {c.rfm.recenciaDias}d atrás
                        </div>
                      </>
                    ) : "Nunca"}
                  </td>
                  <td style={td()}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {wa && <AcaoIcone href={wa} icone="💬" titulo="WhatsApp" cor={C.green} />}
                      {tel && <AcaoIcone href={tel} icone="📞" titulo="Ligar" cor={C.accent} />}
                      {mail && <AcaoIcone href={mail} icone="✉️" titulo="Email" cor={C.purple} />}
                      {podeEditar && (
                        <button
                          onClick={() => onAbrirTags(c)}
                          title="Gerenciar tags"
                          style={{
                            background: "transparent", border: `1px solid ${C.border}`,
                            color: C.muted, borderRadius: 4, padding: "4px 8px",
                            cursor: "pointer", fontSize: 13,
                          }}
                        >🏷️</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function th() {
  return { padding: "10px 12px", textAlign: "left", fontWeight: 700 };
}

function td() {
  return { padding: "10px 12px", verticalAlign: "middle" };
}

function AcaoIcone({ href, icone, titulo, cor }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={titulo}
      style={{
        background: cor + "22", color: cor, borderRadius: 4,
        padding: "4px 8px", textDecoration: "none", fontSize: 13,
        display: "inline-flex", alignItems: "center",
        border: `1px solid ${cor}44`,
      }}
    >{icone}</a>
  );
}

// ============ MODAL GERENCIAR TAGS DE UM CLIENTE ============

function ModalGerenciarTagsCliente({ cliente, tags, onToggleTag, onFechar, onNovaTag, podeEditar }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onFechar(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFechar]);

  const tagsAtivasIds = new Set(cliente.tags.map((t) => t.id));

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
      }}
    >
      <div style={{
        background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
        width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: C.white, fontSize: 16, fontWeight: 700 }}>🏷️ Tags do cliente</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{cliente.nome}</div>
          </div>
          <button onClick={onFechar} style={{
            background: "transparent", color: C.muted, border: "none",
            fontSize: 22, cursor: "pointer", padding: 4,
          }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 6 }}>
          {tags.length === 0 && (
            <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 20 }}>
              Nenhuma tag cadastrada ainda.
              {podeEditar && (
                <div style={{ marginTop: 8 }}>
                  <button
                    onClick={onNovaTag}
                    style={{
                      background: C.accent, color: C.white, border: "none",
                      padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                    }}
                  >+ Criar primeira tag</button>
                </div>
              )}
            </div>
          )}
          {tags.map((t) => {
            const ativa = tagsAtivasIds.has(t.id);
            return (
              <label key={t.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", cursor: podeEditar ? "pointer" : "default",
                background: ativa ? t.cor + "11" : "transparent",
                borderRadius: 6, border: `1px solid ${ativa ? t.cor + "55" : C.border}`,
              }}>
                <input
                  type="checkbox"
                  checked={ativa}
                  disabled={!podeEditar}
                  onChange={() => onToggleTag(t.id, ativa)}
                  style={{ accentColor: t.cor }}
                />
                <span style={{
                  background: t.cor + "22", color: t.cor,
                  padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                }}>{t.nome}</span>
                <span style={{ color: C.muted, fontSize: 11, marginLeft: "auto" }}>
                  {t.totalClientes} {t.totalClientes === 1 ? "cliente" : "clientes"}
                </span>
              </label>
            );
          })}
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {podeEditar && tags.length > 0 && (
            <button
              onClick={onNovaTag}
              style={{
                background: "transparent", color: C.accent, border: `1px solid ${C.accent}`,
                padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13,
              }}
            >+ Nova tag</button>
          )}
          <button
            onClick={onFechar}
            style={{
              background: C.accent, color: C.white, border: "none",
              padding: "8px 22px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700,
            }}
          >Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ============ MODAL CRUD DE TAGS ============

function ModalGerirTags({ tags, onFechar, onMudou, podeEditar, podeExcluir }) {
  const [editando, setEditando] = useState(null); // { id?, nome, cor }
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape" && !editando) onFechar(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFechar, editando]);

  async function salvar() {
    if (!editando.nome.trim()) return;
    setSalvando(true);
    try {
      if (editando.id) {
        await api.atualizarTag(editando.id, { nome: editando.nome.trim(), cor: editando.cor });
      } else {
        await api.criarTag({ nome: editando.nome.trim(), cor: editando.cor });
      }
      setEditando(null);
      await onMudou();
    } catch (e) {
      alert(e.message || "Erro ao salvar tag");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(tag) {
    if (!confirm(`Excluir tag "${tag.nome}"? Sera removida de ${tag.totalClientes} cliente(s).`)) return;
    try {
      await api.excluirTag(tag.id);
      await onMudou();
    } catch (e) {
      alert(e.message || "Erro ao excluir tag");
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !editando) onFechar(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
      }}
    >
      <div style={{
        background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
        width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: C.white, fontSize: 16, fontWeight: 700 }}>🏷️ Gerir Tags</div>
          <button onClick={onFechar} style={{
            background: "transparent", color: C.muted, border: "none",
            fontSize: 22, cursor: "pointer", padding: 4,
          }}>×</button>
        </div>

        <div style={{ padding: 20 }}>
          {podeEditar && !editando && (
            <button
              onClick={() => setEditando({ nome: "", cor: "#4f8ef7" })}
              style={{
                background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                color: C.white, border: "none", padding: "8px 18px",
                borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700, marginBottom: 14,
              }}
            >+ Nova tag</button>
          )}

          {editando && (
            <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                {editando.id ? "Editando tag" : "Nova tag"}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  autoFocus
                  value={editando.nome}
                  onChange={(e) => setEditando({ ...editando, nome: e.target.value.toUpperCase() })}
                  placeholder="VIP, ATACADO, B2B..."
                  maxLength={30}
                  style={{ ...inputFiltro(220), background: C.surface }}
                />
                <input
                  type="color"
                  value={editando.cor}
                  onChange={(e) => setEditando({ ...editando, cor: e.target.value })}
                  style={{ width: 48, height: 34, border: `1px solid ${C.border}`, borderRadius: 6, padding: 2, cursor: "pointer", background: "transparent" }}
                />
                <span style={{
                  background: editando.cor + "22", color: editando.cor,
                  padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                }}>
                  {editando.nome || "PREVIEW"}
                </span>
                <button
                  onClick={salvar}
                  disabled={salvando || !editando.nome.trim()}
                  style={{
                    background: C.accent, color: C.white, border: "none",
                    padding: "7px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700,
                  }}
                >{salvando ? "..." : "Salvar"}</button>
                <button
                  onClick={() => setEditando(null)}
                  disabled={salvando}
                  style={{
                    background: "transparent", color: C.muted, border: `1px solid ${C.border}`,
                    padding: "7px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                  }}
                >Cancelar</button>
              </div>
            </div>
          )}

          {tags.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 30 }}>
              Nenhuma tag cadastrada.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {tags.map((t) => (
                <div key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6,
                }}>
                  <span style={{
                    background: t.cor + "22", color: t.cor,
                    padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                  }}>{t.nome}</span>
                  <span style={{ color: C.muted, fontSize: 11 }}>
                    {t.totalClientes} {t.totalClientes === 1 ? "cliente" : "clientes"}
                  </span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                    {podeEditar && (
                      <button
                        onClick={() => setEditando({ id: t.id, nome: t.nome, cor: t.cor })}
                        style={{
                          background: "transparent", color: C.muted, border: `1px solid ${C.border}`,
                          padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11,
                        }}
                      >Editar</button>
                    )}
                    {podeExcluir && (
                      <button
                        onClick={() => excluir(t)}
                        style={{
                          background: "transparent", color: C.red, border: `1px solid ${C.red}44`,
                          padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11,
                        }}
                      >🗑</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
