import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { C } from "./lib/theme.js";
import { api, BASE_URL } from "./lib/api.js";
import MovimentarEstoqueModal from "./MovimentarEstoqueModal.jsx";
import ActionsMenu from "./components/ActionsMenu.jsx";
import EtiquetaPrecoModal from "./components/EtiquetaPrecoModal.jsx";
import { FormularioLuxuoso, Secao, Linha, Campo as CampoLux } from "./components/FormularioLuxuoso.jsx";


const VAZIO = {
  codigo: "", codigoBarras: "", referencia: "",
  nome: "", descricao: "",
  tipoItem: "PRODUTO",
  precoVenda: "", precoCusto: "",
  estoque: "0", estoqueMinimo: "0", unidade: "UN",
  categoriaId: "", fornecedorId: "",
};

// Resolve url relativa do backend (/uploads/...) para URL absoluta consumivel
// pelas tags <img>. Aceita tambem URLs absolutas (http/https) inalteradas.
export function urlImagem(imagem) {
  if (!imagem) return null;
  if (/^https?:\/\//i.test(imagem)) return imagem;
  return `${BASE_URL}${imagem}`;
}

const fmtBRL = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

// Sugere o proximo codigo numerico com base nos produtos existentes.
// Considera apenas codigos puramente numericos; pad para no minimo 4 digitos.
// Em caso de conflito (criacao concorrente), o backend responde 409 e o
// usuario ajusta manualmente.
function proximoCodigoSugerido(produtos) {
  const numericos = produtos
    .map(p => String(p.codigo || "").match(/^(\d+)$/))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10))
    .filter(n => Number.isFinite(n));
  const proximo = numericos.length === 0 ? 1 : Math.max(...numericos) + 1;
  const len = Math.max(4, String(proximo).length);
  return String(proximo).padStart(len, "0");
}

export default function Produtos({ user }) {
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [search, setSearch] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroFornecedor, setFiltroFornecedor] = useState("");
  const [estoqueBaixo, setEstoqueBaixo] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [novaCategoria, setNovaCategoria] = useState("");
  const [modalEstoqueProduto, setModalEstoqueProduto] = useState(null);
  const [modalEtiquetaProduto, setModalEtiquetaProduto] = useState(null);

  // Auxiliares de calculo de markup (nao persistidos no banco — apenas
  // ajudam a sugerir o preco de venda no formulario).
  const MARKUP_VAZIO = { impostos: "", taxasCartao: "", margemLucro: "" };
  const [markup, setMarkup] = useState(MARKUP_VAZIO);

  // Upload de imagem: arquivo selecionado (File|null), preview local (objectURL
  // ou URL ja persistida no backend) e flag "remover atual ao salvar".
  const [imagemArquivo, setImagemArquivo] = useState(null);
  const [imagemPreview, setImagemPreview] = useState(null);
  const [removerImagem, setRemoverImagem] = useState(false);
  const inputImagemRef = useRef(null);

  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE";
  const podeExcluir = user.role === "ADMIN";

  const CAMPOS_PROGRESSO = ["codigo", "nome", "codigoBarras", "referencia", "descricao", "precoCusto", "precoVenda", "estoque", "unidade", "categoriaId", "fornecedorId"];
  const progressoForm = useMemo(() => {
    let preenchidos = 0;
    for (const k of CAMPOS_PROGRESSO) {
      if (String(form[k] || "").trim()) preenchidos++;
    }
    if (imagemPreview) preenchidos++;
    const total = CAMPOS_PROGRESSO.length + 1;
    return Math.round((preenchidos / total) * 100);
  }, [form, imagemPreview]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await api.listarProdutos({
        search,
        ativo: filtroAtivo,
        categoriaId: filtroCategoria,
        fornecedorId: filtroFornecedor,
        estoqueBaixo: estoqueBaixo ? "true" : "",
      });
      setProdutos(data);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [search, filtroAtivo, filtroCategoria, filtroFornecedor, estoqueBaixo]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  useEffect(() => {
    api.listarCategorias().then(setCategorias).catch(() => {});
    api.listarFornecedores({ ativo: "true" }).then(setFornecedores).catch(() => {});
  }, []);

  function flash(texto) {
    setMensagem(texto);
    setTimeout(() => setMensagem(""), 2500);
  }

  function resetarImagem() {
    setImagemArquivo(null);
    setImagemPreview(null);
    setRemoverImagem(false);
    if (inputImagemRef.current) inputImagemRef.current.value = "";
  }

  async function abrirNovo() {
    setEditando(null);
    setErroForm("");
    setNovaCategoria("");
    setMarkup(MARKUP_VAZIO);
    resetarImagem();
    // Busca lista completa (sem filtros) para sugerir codigo correto mesmo
    // quando a tela esta filtrada. Cai para a lista local se o backend falhar.
    let codigo = "";
    try {
      const todos = await api.listarProdutos({});
      codigo = proximoCodigoSugerido(todos);
    } catch {
      codigo = proximoCodigoSugerido(produtos);
    }
    setForm({ ...VAZIO, codigo });
    setModalAberto(true);
  }

  async function sugerirCodigo() {
    try {
      const todos = await api.listarProdutos({});
      setForm(f => ({ ...f, codigo: proximoCodigoSugerido(todos) }));
    } catch {
      setForm(f => ({ ...f, codigo: proximoCodigoSugerido(produtos) }));
    }
  }

  function abrirEdicao(p) {
    setEditando(p);
    setForm({
      codigo: p.codigo || "",
      codigoBarras: p.codigoBarras || "",
      referencia: p.referencia || "",
      nome: p.nome || "",
      descricao: p.descricao || "",
      tipoItem: p.tipoItem || "PRODUTO",
      precoVenda: p.precoVenda != null ? String(p.precoVenda) : "",
      precoCusto: p.precoCusto != null ? String(p.precoCusto) : "",
      estoque: String(p.estoque ?? 0),
      estoqueMinimo: String(p.estoqueMinimo ?? 0),
      unidade: p.unidade || "UN",
      categoriaId: p.categoriaId || "",
      fornecedorId: p.fornecedorId || "",
    });
    setErroForm("");
    setNovaCategoria("");
    setMarkup(MARKUP_VAZIO);
    setImagemArquivo(null);
    setImagemPreview(p.imagem ? urlImagem(p.imagem) : null);
    setRemoverImagem(false);
    if (inputImagemRef.current) inputImagemRef.current.value = "";
    setModalAberto(true);
  }

  function escolherImagem(file) {
    if (!file) return;
    if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) {
      setErroForm("Apenas JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErroForm("Imagem maior que 2MB.");
      return;
    }
    setErroForm("");
    setImagemArquivo(file);
    setRemoverImagem(false);
    // Cria URL local para preview imediato (revogada quando substituida).
    setImagemPreview(prev => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  function limparImagem() {
    if (imagemPreview && imagemPreview.startsWith("blob:")) {
      URL.revokeObjectURL(imagemPreview);
    }
    setImagemArquivo(null);
    setImagemPreview(null);
    if (inputImagemRef.current) inputImagemRef.current.value = "";
    // Se estava editando um produto que ja tinha imagem, sinaliza remocao
    // no salvar.
    setRemoverImagem(!!editando?.imagem);
  }

  async function criarCategoriaInline() {
    const nome = novaCategoria.trim();
    if (!nome) return;
    try {
      const cat = await api.criarCategoria({ nome });
      setCategorias(prev => [...prev, cat].sort((a, b) => a.nome.localeCompare(b.nome)));
      setForm(f => ({ ...f, categoriaId: cat.id }));
      setNovaCategoria("");
    } catch (err) {
      alert(err.message);
    }
  }

  async function salvar(e) {
    e.preventDefault();
    setErroForm("");
    if (!form.codigo.trim()) { setErroForm("Código é obrigatório"); return; }
    if (!form.nome.trim()) { setErroForm("Nome é obrigatório"); return; }
    if (form.precoVenda === "" || Number.isNaN(Number(form.precoVenda))) {
      setErroForm("Preço de venda inválido"); return;
    }

    setSalvando(true);
    try {
      const ehServico = form.tipoItem === "SERVICO";
      const payload = {
        codigo: form.codigo,
        codigoBarras: form.codigoBarras || null,
        referencia: form.referencia || null,
        nome: form.nome,
        descricao: form.descricao,
        tipoItem: form.tipoItem,
        precoVenda: form.precoVenda,
        precoCusto: form.precoCusto === "" ? null : form.precoCusto,
        // Servicos sempre vao com estoque zerado — backend ja ignora, mas
        // mandamos explicito para nao depender disso.
        estoque: ehServico ? "0" : form.estoque,
        estoqueMinimo: ehServico ? "0" : form.estoqueMinimo,
        unidade: form.unidade,
        categoriaId: form.categoriaId || null,
        fornecedorId: form.fornecedorId || null,
      };
      const produtoSalvo = editando
        ? await api.atualizarProduto(editando.id, payload)
        : await api.criarProduto(payload);

      // Imagem: enviar nova OU remover existente. Falha no upload nao reverte
      // o produto criado/editado — exibe aviso e mantem o restante salvo.
      try {
        if (imagemArquivo) {
          await api.enviarImagemProduto(produtoSalvo.id, imagemArquivo);
        } else if (removerImagem && editando?.imagem) {
          await api.excluirImagemProduto(produtoSalvo.id);
        }
      } catch (errImg) {
        flash(`Produto salvo, mas a imagem falhou: ${errImg.message}`);
        setModalAberto(false);
        carregar();
        return;
      }

      flash(editando ? "Produto atualizado" : "Produto criado");
      setModalAberto(false);
      carregar();
    } catch (err) {
      setErroForm(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(p) {
    try {
      if (p.ativo) {
        if (!confirm(`Inativar "${p.nome}"?`)) return;
        await api.excluirProduto(p.id);
        flash("Produto inativado");
      } else {
        await api.atualizarProduto(p.id, { ativo: true });
        flash("Produto reativado");
      }
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Buscar por código, código de barras, referência ou nome..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            flex: "1 1 240px", background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14, outline: "none",
          }}
        />
        <select value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value)} style={selectStyle}>
          <option value="">Todos status</option>
          <option value="true">Apenas ativos</option>
          <option value="false">Apenas inativos</option>
        </select>
        <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={selectStyle}>
          <option value="">Todas categorias</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select value={filtroFornecedor} onChange={e => setFiltroFornecedor(e.target.value)} style={selectStyle}>
          <option value="">Todos fornecedores</option>
          {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <label style={{ color: C.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={estoqueBaixo} onChange={e => setEstoqueBaixo(e.target.checked)} />
          Estoque baixo
        </label>
        {podeEditar && (
          <button onClick={abrirNovo} style={{
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: C.white, border: "none", borderRadius: 8,
            padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>
            + Novo Produto
          </button>
        )}
      </div>

      {mensagem && (
        <div style={alertStyle(C.green)}>{mensagem}</div>
      )}
      {erro && (
        <div style={alertStyle(C.red)}>{erro}</div>
      )}

      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "100px 1.6fr 1.2fr 110px 110px 90px 100px 80px",
          padding: "12px 16px", background: C.surface,
          borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700,
          color: C.muted, textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          <div>Código</div>
          <div>Nome</div>
          <div>Categoria / Fornecedor</div>
          <div style={{ textAlign: "right" }}>Preço Venda</div>
          <div style={{ textAlign: "right" }}>Estoque</div>
          <div>Unid</div>
          <div>Status</div>
          <div style={{ textAlign: "right" }}>Ações</div>
        </div>

        {carregando ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>Carregando...</div>
        ) : produtos.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>Nenhum produto encontrado.</div>
        ) : produtos.map(p => {
          const ehServico = p.tipoItem === "SERVICO";
          const baixo = !ehServico && p.estoque <= p.estoqueMinimo;
          return (
            <div key={p.id} style={{
              display: "grid", gridTemplateColumns: "100px 1.6fr 1.2fr 110px 110px 90px 100px 80px",
              padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
              alignItems: "center", fontSize: 13, opacity: p.ativo ? 1 : 0.55,
            }}>
              <div style={{ color: C.muted, fontFamily: "monospace", fontSize: 12 }}>
                <div>{p.codigo}</div>
                {p.codigoBarras && (
                  <div style={{ fontSize: 10, marginTop: 2, color: C.accent }} title="Código de barras">
                    📊 {p.codigoBarras}
                  </div>
                )}
                {p.referencia && (
                  <div style={{ fontSize: 10, marginTop: 1, color: C.purple }} title="Referência">
                    🏷 {p.referencia}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                <Miniatura url={p.imagem} nome={p.nome} servico={ehServico} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.white, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                    {p.nome}
                    {ehServico && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4,
                        background: C.purple + "22", color: C.purple, border: `1px solid ${C.purple}55`,
                        letterSpacing: 0.4,
                      }}>SERVIÇO</span>
                    )}
                  </div>
                  {p.descricao && (
                    <div style={{ color: C.muted, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.descricao}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 12 }}>
                <div style={{ color: C.text }}>{p.categoria?.nome || <span style={{ color: C.muted }}>—</span>}</div>
                <div style={{ color: C.muted, marginTop: 2 }}>{p.fornecedor?.nome || "—"}</div>
              </div>
              <div style={{ textAlign: "right", color: C.green, fontWeight: 600 }}>
                {fmtBRL(p.precoVenda)}
              </div>
              <div style={{ textAlign: "right" }}>
                {ehServico ? (
                  <span title="Serviço — sem controle de estoque" style={{
                    color: C.purple, fontWeight: 700, fontSize: 16, letterSpacing: 0.5,
                  }}>♾</span>
                ) : (
                  <span style={{ color: baixo ? C.red : C.text, fontWeight: baixo ? 700 : 500 }}>
                    {p.estoque}
                    {baixo && <span style={{ fontSize: 10, marginLeft: 6 }}>⚠</span>}
                  </span>
                )}
              </div>
              <div style={{ color: C.muted, fontSize: 12 }}>{ehServico ? "—" : p.unidade}</div>
              <div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                  background: p.ativo ? C.green + "22" : C.muted + "33",
                  color: p.ativo ? C.green : C.muted,
                  border: `1px solid ${p.ativo ? C.green + "55" : C.muted + "55"}`,
                }}>{p.ativo ? "ATIVO" : "INATIVO"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <ActionsMenu
                  items={[
                    {
                      label: "Movimentar estoque",
                      icon: "📊",
                      color: C.yellow,
                      onClick: () => setModalEstoqueProduto(p),
                      hidden: !podeEditar || ehServico,
                    },
                    {
                      label: "Imprimir etiqueta",
                      icon: "🏷️",
                      color: C.purple,
                      onClick: () => setModalEtiquetaProduto(p),
                      hidden: ehServico,
                    },
                    {
                      label: "Editar",
                      icon: "✎",
                      color: C.accent,
                      onClick: () => abrirEdicao(p),
                      hidden: !podeEditar,
                    },
                    {
                      label: p.ativo ? "Inativar" : "Reativar",
                      icon: p.ativo ? "⊘" : "↻",
                      color: p.ativo ? C.yellow : C.green,
                      onClick: () => alternarAtivo(p),
                      hidden: !podeExcluir,
                    },
                  ]}
                />
              </div>
            </div>
          );
        })}
      </div>

      {modalEstoqueProduto && (
        <MovimentarEstoqueModal
          produtos={produtos}
          produtoInicial={modalEstoqueProduto}
          onCancelar={() => setModalEstoqueProduto(null)}
          onSalvar={(mov) => {
            setModalEstoqueProduto(null);
            flash(`Estoque atualizado: ${mov.estoqueAntes} → ${mov.estoqueDepois}`);
            carregar();
          }}
        />
      )}

      {modalEtiquetaProduto && (
        <EtiquetaPrecoModal
          produto={modalEtiquetaProduto}
          onFechar={() => setModalEtiquetaProduto(null)}
        />
      )}

      <FormularioLuxuoso
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        onSubmit={salvar}
        titulo={editando ? "Editar" : "Novo"}
        tituloDestaque="Produto"
        subtitulo={
          editando
            ? "Atualize as informacoes deste produto. Campos marcados com • sao obrigatorios."
            : "Cadastre um produto no seu catalogo. Campos marcados com • sao obrigatorios."
        }
        numeroLote={editando ? `#${form.codigo || ""}` : null}
        data={new Date().toLocaleDateString("pt-BR")}
        progresso={progressoForm}
        salvando={salvando}
        textoSalvar="Criar produto"
        editando={!!editando}
        erro={erroForm}
        larguraMax={860}
      >
        <Secao legenda="Identificação">
          <Linha cols={3}>
            <CampoLux label="Código" obrigatorio>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="lux-input"
                  value={form.codigo}
                  onChange={e => setForm({ ...form, codigo: e.target.value })}
                  style={{ flex: 1 }}
                  autoFocus
                />
                <button type="button" onClick={sugerirCodigo} title="Sugerir próximo código"
                  style={{
                    background: C.surface, border: `1px solid ${C.border}`,
                    color: C.accent, borderRadius: 10, padding: "0 12px",
                    fontSize: 16, cursor: "pointer", fontWeight: 600,
                  }}>↻</button>
              </div>
            </CampoLux>
            <CampoLux label="Nome" obrigatorio span={2}>
              <input
                className="lux-input"
                value={form.nome}
                onChange={e => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex.: Caneta esferográfica azul BIC"
              />
            </CampoLux>
          </Linha>
          <Linha cols={3}>
            <CampoLux label="Código de barras">
              <input
                className="lux-input"
                value={form.codigoBarras}
                onChange={e => setForm({ ...form, codigoBarras: e.target.value.replace(/\s/g, "") })}
                placeholder="EAN-13, EAN-8, GTIN…"
                inputMode="numeric"
                style={{ fontFamily: "ui-monospace, monospace" }}
              />
            </CampoLux>
            <CampoLux label="Referência" span={2}>
              <input
                className="lux-input"
                value={form.referencia}
                onChange={e => setForm({ ...form, referencia: e.target.value.toUpperCase() })}
                placeholder="Código do fabricante / fornecedor"
              />
            </CampoLux>
          </Linha>
          <Linha cols={1}>
            <CampoLux label="Descrição">
              <textarea
                className="lux-textarea"
                value={form.descricao}
                onChange={e => setForm({ ...form, descricao: e.target.value })}
                rows={2}
                placeholder="Detalhes complementares do produto…"
              />
            </CampoLux>
          </Linha>
        </Secao>

        <Secao legenda="Imagem">
          <Linha cols={1}>
            <CampoLux label="Foto do produto" hint="JPG, PNG ou WEBP · máx 2 MB">
              <DropzoneImagem
                preview={imagemPreview}
                onSelecionar={escolherImagem}
                onLimpar={limparImagem}
                inputRef={inputImagemRef}
              />
            </CampoLux>
          </Linha>
        </Secao>

        <Secao legenda="Tipo do item">
          <Linha cols={1}>
            <CampoLux>
              <SeletorTipoItem
                valor={form.tipoItem}
                onMudar={t => setForm(f => ({ ...f, tipoItem: t }))}
              />
            </CampoLux>
          </Linha>
        </Secao>

        <Secao legenda="Preços e estoque">
          <Linha cols={3}>
            <CampoLux label="Preço de custo (R$)">
              <input
                className="lux-input"
                type="number" step="0.01" min="0"
                value={form.precoCusto}
                onChange={e => setForm({ ...form, precoCusto: e.target.value })}
                placeholder="0,00"
              />
            </CampoLux>
            <CampoLux label="Preço de venda" obrigatorio>
              <input
                className="lux-input"
                type="number" step="0.01" min="0"
                value={form.precoVenda}
                onChange={e => setForm({ ...form, precoVenda: e.target.value })}
                placeholder="0,00"
              />
            </CampoLux>
            <CampoLux label="Unidade">
              <input
                className="lux-input"
                value={form.unidade}
                onChange={e => setForm({ ...form, unidade: e.target.value.toUpperCase().slice(0, 6) })}
                placeholder="UN, KG, LT..."
              />
            </CampoLux>
          </Linha>
          <Linha cols={1}>
            <CampoLux label="Cálculo de markup">
              <CalculoMarkup
                precoCusto={form.precoCusto}
                markup={markup}
                onChange={setMarkup}
                onAplicar={(valor) => setForm(f => ({ ...f, precoVenda: valor }))}
              />
            </CampoLux>
          </Linha>
          <Linha>
            <CampoLux label={form.tipoItem === "SERVICO" ? "Estoque atual (n/a — serviço)" : "Estoque atual"}>
              <input
                className="lux-input"
                type="number" min="0"
                value={form.tipoItem === "SERVICO" ? "" : form.estoque}
                onChange={e => setForm({ ...form, estoque: e.target.value })}
                disabled={form.tipoItem === "SERVICO"}
                placeholder={form.tipoItem === "SERVICO" ? "♾ Ilimitado" : ""}
                style={form.tipoItem === "SERVICO" ? { background: C.bg, color: C.muted, borderStyle: "dashed", cursor: "not-allowed" } : undefined}
              />
            </CampoLux>
            <CampoLux label={form.tipoItem === "SERVICO" ? "Estoque mínimo (n/a — serviço)" : "Estoque mínimo"}>
              <input
                className="lux-input"
                type="number" min="0"
                value={form.tipoItem === "SERVICO" ? "" : form.estoqueMinimo}
                onChange={e => setForm({ ...form, estoqueMinimo: e.target.value })}
                disabled={form.tipoItem === "SERVICO"}
                placeholder={form.tipoItem === "SERVICO" ? "—" : ""}
                style={form.tipoItem === "SERVICO" ? { background: C.bg, color: C.muted, borderStyle: "dashed", cursor: "not-allowed" } : undefined}
              />
            </CampoLux>
          </Linha>
        </Secao>

        <Secao legenda="Categorização">
          <Linha cols={1}>
            <CampoLux label="Fornecedor">
              <select
                className="lux-select"
                value={form.fornecedorId}
                onChange={e => setForm({ ...form, fornecedorId: e.target.value })}
              >
                <option value="">— Sem fornecedor —</option>
                {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </CampoLux>
          </Linha>
          <Linha cols={1}>
            <CampoLux label="Categoria">
              <select
                className="lux-select"
                value={form.categoriaId}
                onChange={e => setForm({ ...form, categoriaId: e.target.value })}
              >
                <option value="">— Sem categoria —</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  className="lux-input"
                  value={novaCategoria}
                  onChange={e => setNovaCategoria(e.target.value)}
                  placeholder="Nome da nova categoria"
                  style={{ flex: 1 }}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); criarCategoriaInline(); } }}
                />
                <button type="button" onClick={criarCategoriaInline} disabled={!novaCategoria.trim()} style={{
                  background: novaCategoria.trim() ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : C.muted,
                  color: C.white, border: "none",
                  borderRadius: 10, padding: "0 16px", fontWeight: 700, fontSize: 12,
                  cursor: novaCategoria.trim() ? "pointer" : "default",
                }}>+ Adicionar</button>
              </div>
            </CampoLux>
          </Linha>
        </Secao>
      </FormularioLuxuoso>
    </div>
  );
}

const inputStyle = {
  width: "100%", background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 13,
  outline: "none", boxSizing: "border-box",
};

const selectStyle = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: "10px 12px", color: C.text, fontSize: 13, cursor: "pointer",
};

function alertStyle(cor) {
  return {
    marginBottom: 12, padding: "10px 14px", borderRadius: 8,
    background: cor + "22", border: `1px solid ${cor}55`, color: cor, fontSize: 13,
  };
}

function Miniatura({ url, nome, servico = false }) {
  const src = urlImagem(url);
  if (src) {
    return (
      <img
        src={src}
        alt={nome || ""}
        loading="lazy"
        style={{
          width: 40, height: 40, borderRadius: 8, objectFit: "cover",
          border: `1px solid ${C.border}`, background: C.surface, flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 8, flexShrink: 0,
      background: servico ? C.purple + "22" : C.surface,
      border: `1px solid ${servico ? C.purple + "55" : C.border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: servico ? C.purple : C.muted, fontSize: 18,
    }}>{servico ? "🛠" : "📦"}</div>
  );
}

function SeletorTipoItem({ valor, onMudar }) {
  const opcoes = [
    { id: "PRODUTO", icone: "📦", label: "Produto físico", desc: "Controla estoque, gera entradas/saídas, alerta quando baixo." },
    { id: "SERVICO", icone: "🛠", label: "Serviço / digital", desc: "Sem estoque. Sempre disponível para venda (impressão, 2ª via...)." },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {opcoes.map(opt => {
        const ativo = valor === opt.id;
        return (
          <button key={opt.id} type="button" onClick={() => onMudar(opt.id)} style={{
            cursor: "pointer", textAlign: "left",
            padding: "12px 14px", borderRadius: 10,
            background: ativo ? (opt.id === "SERVICO" ? C.purple + "22" : C.accent + "22") : C.surface,
            border: `1px solid ${ativo ? (opt.id === "SERVICO" ? C.purple : C.accent) : C.border}`,
            color: ativo ? C.white : C.text,
            transition: "all 0.15s ease",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13 }}>
              <span style={{ fontSize: 18 }}>{opt.icone}</span>
              {opt.label}
            </div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{opt.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

function CalculoMarkup({ precoCusto, markup, onChange, onAplicar }) {
  const custo = Number(precoCusto) || 0;
  const impostos = Number(markup.impostos) || 0;
  const taxas = Number(markup.taxasCartao) || 0;
  const margem = Number(markup.margemLucro) || 0;
  const totalPct = impostos + taxas + margem;

  // Formula: Preco = Custo / (1 - (Total% / 100))
  // Soma >= 100 torna a divisao invalida (custo nunca seria recuperado).
  const valido = custo > 0 && totalPct > 0 && totalPct < 100;
  const sugerido = valido ? custo / (1 - totalPct / 100) : 0;

  const set = (campo) => (e) => onChange({ ...markup, [campo]: e.target.value });

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: 14,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <SubCampo label="Impostos sobre Venda (%)">
          <input type="number" step="0.01" min="0" value={markup.impostos}
            onChange={set("impostos")} style={inputStyle} placeholder="0,00" />
        </SubCampo>
        <SubCampo label="Taxas de Cartão (%)">
          <input type="number" step="0.01" min="0" value={markup.taxasCartao}
            onChange={set("taxasCartao")} style={inputStyle} placeholder="0,00" />
        </SubCampo>
        <SubCampo label="Margem de Lucro Desejada (%)">
          <input type="number" step="0.01" min="0" value={markup.margemLucro}
            onChange={set("margemLucro")} style={inputStyle} placeholder="0,00" />
        </SubCampo>
      </div>

      <div style={{
        marginTop: 12, padding: "10px 12px", borderRadius: 8,
        background: C.bg, border: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
            Preço Sugerido (somatório: {totalPct.toFixed(2)}%)
          </div>
          <div style={{
            color: valido ? C.green : C.muted,
            fontSize: 18, fontWeight: 800, letterSpacing: 0.3,
          }}>
            {valido ? fmtBRL(sugerido) : "—"}
          </div>
        </div>
        <button type="button" disabled={!valido}
          onClick={() => onAplicar(sugerido.toFixed(2))}
          style={{
            background: valido ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : C.muted,
            color: C.white, border: "none", borderRadius: 8,
            padding: "10px 16px", fontWeight: 700, fontSize: 12,
            cursor: valido ? "pointer" : "not-allowed",
          }}>
          Aplicar ao preço de venda
        </button>
      </div>

      {custo > 0 && totalPct >= 100 && (
        <div style={{
          marginTop: 10, padding: "8px 12px", borderRadius: 8,
          background: C.red + "22", border: `1px solid ${C.red}55`,
          color: C.red, fontSize: 12,
        }}>
          ⚠ A soma dos percentuais ({totalPct.toFixed(2)}%) deve ser menor que 100%.
        </div>
      )}
      {custo === 0 && totalPct > 0 && (
        <div style={{ marginTop: 10, color: C.muted, fontSize: 12 }}>
          ℹ Informe o Preço de Custo para calcular a sugestão.
        </div>
      )}
    </div>
  );
}

function SubCampo({ label, children }) {
  return (
    <div>
      <label style={{ display: "block", color: C.muted, fontSize: 11, marginBottom: 6, fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function DropzoneImagem({ preview, onSelecionar, onLimpar, inputRef }) {
  const [arrastando, setArrastando] = useState(false);

  function aoArrastar(e) {
    e.preventDefault();
    e.stopPropagation();
    setArrastando(e.type === "dragenter" || e.type === "dragover");
  }
  function aoSoltar(e) {
    e.preventDefault();
    e.stopPropagation();
    setArrastando(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onSelecionar(f);
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
      <div
        onDragEnter={aoArrastar}
        onDragOver={aoArrastar}
        onDragLeave={aoArrastar}
        onDrop={aoSoltar}
        onClick={() => inputRef.current?.click()}
        style={{
          flex: 1,
          background: arrastando ? C.accent + "22" : C.surface,
          border: `2px dashed ${arrastando ? C.accent : C.border}`,
          borderRadius: 10, padding: "18px 14px",
          textAlign: "center", cursor: "pointer", color: C.muted, fontSize: 13,
          transition: "all 0.15s ease",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 4 }}>🖼️</div>
        <div style={{ color: C.text, fontWeight: 600 }}>
          {preview ? "Trocar imagem" : "Clique ou arraste uma imagem"}
        </div>
        <div style={{ fontSize: 11, marginTop: 4 }}>JPG, PNG ou WEBP • máx 2 MB</div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={e => onSelecionar(e.target.files?.[0])}
          style={{ display: "none" }}
        />
      </div>
      {preview && (
        <div style={{ position: "relative", flexShrink: 0 }}>
          <img
            src={preview}
            alt="Preview"
            style={{
              width: 120, height: 120, objectFit: "cover", borderRadius: 10,
              border: `1px solid ${C.border}`, background: C.surface,
            }}
          />
          <button
            type="button"
            onClick={onLimpar}
            title="Remover imagem"
            style={{
              position: "absolute", top: -8, right: -8,
              width: 26, height: 26, borderRadius: "50%",
              background: C.red, border: `2px solid ${C.card}`, color: C.white,
              fontSize: 14, fontWeight: 800, cursor: "pointer", lineHeight: 1,
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            }}
          >×</button>
        </div>
      )}
    </div>
  );
}
