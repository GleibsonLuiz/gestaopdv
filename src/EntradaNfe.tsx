import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser } from "./lib/api";
import { emitirToast } from "./lib/toast";
import { fmtBRL, fmtData, fmtQtd } from "./lib/format";

// Entrada de NF-e de fornecedor (importacao de compra). Fluxo:
//   1. upload do XML -> validado no backend (bloqueia se reprovar)
//   2. fica em staging RECEBIDA com sugestoes de de-para (fornecedor/produtos)
//   3. operador concilia (confirma fornecedor + vincula produtos) e efetiva
//   4. vira Compra + entrada de estoque + contas a pagar das duplicatas

type EntradaLista = {
  id: string;
  chaveAcesso: string;
  status: "RECEBIDA" | "IMPORTADA" | "DESCARTADA";
  numero?: string | null;
  serie?: string | null;
  emitenteCnpj?: string | null;
  emitenteNome?: string | null;
  valorTotal?: number | string | null;
  dataEmissao?: string | null;
  fornecedorId?: string | null;
  compraId?: string | null;
  createdAt: string;
};

type ItemNfe = {
  numero: number;
  cProdFornecedor?: string | null;
  cEAN?: string | null;
  descricao?: string | null;
  ncm?: string | null;
  cest?: string | null;
  cfop?: string | null;
  unidade?: string | null;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  sugestao?: { numero: number; produtoIdSugerido: string | null; origem: string };
  produtoSugerido?: { id: string; codigo: string; nome: string } | null;
};

type Conciliacao = { itens: ItemNfe[]; pendentes: number };
type Detalhe = {
  nota: EntradaLista & { fornecedorId?: string | null; dadosJson?: { duplicatas?: { valor: number }[] } };
  conciliacao: Conciliacao | null;
};
type Produto = { id: string; codigo: string; nome: string; unidade?: string | null; estoque?: number | string | null; precoCusto?: number | string | null };
type Fornecedor = { id: string; nome: string; cnpj?: string | null };
type DocDFe = {
  id: string; nsu: string; tipo: string; chaveAcesso?: string | null;
  status: "PENDENTE" | "XML_BAIXADO" | "IGNORADO";
  emitenteCnpj?: string | null; emitenteNome?: string | null;
  valorTotal?: number | string | null; dataEmissao?: string | null;
  notaEntradaId?: string | null; createdAt: string;
};
const STATUS_DFE_COR: Record<string, string> = { PENDENTE: C.yellow, XML_BAIXADO: C.green, IGNORADO: C.muted };



const STATUS_COR: Record<string, string> = {
  RECEBIDA: C.yellow, IMPORTADA: C.green, DESCARTADA: C.muted,
};
const ORIGEM_LABEL: Record<string, string> = {
  DEPARA: "histórico", GTIN: "código de barras", CODIGO: "código", NENHUM: "sem palpite",
};

export default function EntradaNfe({ user }: { user: SessionUser }) {
  const [lista, setLista] = useState<EntradaLista[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroUpload, setErroUpload] = useState("");
  const [selecionada, setSelecionada] = useState<Detalhe | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [aba, setAba] = useState<"xml" | "sefaz">("xml");
  const [docsDFe, setDocsDFe] = useState<DocDFe[]>([]);
  const [carregandoDFe, setCarregandoDFe] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [acaoDfe, setAcaoDfe] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const podeGerenciar = user.role === "ADMIN" || user.role === "GERENTE";

  const carregar = useCallback(() => {
    setCarregando(true); setErro("");
    api.listarEntradasNfe({ limit: 200 })
      .then((r) => setLista(r as EntradaLista[]))
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    api.listarProdutos({ ativo: "true" }).then((r) => setProdutos((r as Produto[]) || [])).catch(() => {});
    api.listarFornecedores({ ativo: "true" }).then((r) => setFornecedores((r as Fornecedor[]) || [])).catch(() => {});
  }, []);

  const carregarDFe = useCallback(() => {
    setCarregandoDFe(true);
    api.listarDfe({ limit: 200 }).then((r) => setDocsDFe(r as DocDFe[])).catch(() => {}).finally(() => setCarregandoDFe(false));
  }, []);
  useEffect(() => { if (aba === "sefaz") carregarDFe(); }, [aba, carregarDFe]);

  function flashErro(e: unknown) {
    emitirToast({ tipo: "erro", titulo: "Erro", mensagem: (e as Error).message, duracao: 8000 });
  }

  async function abrirConciliacao(id: string) {
    try {
      const r = await api.obterEntradaNfe(id) as Detalhe;
      setSelecionada(r);
    } catch (e) { flashErro(e); }
  }

  function escolherArquivo() { fileRef.current?.click(); }

  function lerArquivo(file: File) {
    if (!/\.xml$/i.test(file.name) && !/xml/i.test(file.type)) {
      setErroUpload("Selecione um arquivo XML da NF-e.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => enviar(String(reader.result || ""));
    reader.onerror = () => setErroUpload("Não foi possível ler o arquivo.");
    reader.readAsText(file, "utf-8");
  }

  function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reenviar o mesmo arquivo
    if (file) lerArquivo(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setArrastando(false);
    const file = e.dataTransfer.files?.[0];
    if (file) lerArquivo(file);
  }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); if (!arrastando) setArrastando(true); }
  function onDragLeave(e: React.DragEvent) { e.preventDefault(); setArrastando(false); }

  async function enviar(xml: string) {
    if (!xml.trim()) return;
    setEnviando(true); setErroUpload("");
    try {
      const r = await api.uploadEntradaNfe(xml) as { nota: EntradaLista };
      emitirToast({ tipo: "sucesso", titulo: "NF-e recebida", mensagem: r.nota.emitenteNome || r.nota.numero || "" });
      carregar();
      abrirConciliacao(r.nota.id);
    } catch (e) {
      setErroUpload((e as Error).message);
    } finally { setEnviando(false); }
  }

  async function descartar(n: EntradaLista) {
    if (!confirm(`Descartar a NF-e de ${n.emitenteNome || n.emitenteCnpj || "?"}?`)) return;
    try {
      await api.descartarEntradaNfe(n.id);
      emitirToast({ tipo: "info", titulo: "Descartada", mensagem: "NF-e descartada." });
      carregar();
    } catch (e) { flashErro(e); }
  }

  async function estornar(n: EntradaLista) {
    if (!confirm(
      `Estornar a importação de ${n.emitenteNome || n.emitenteCnpj || "?"}?\n\n` +
      `Isso reverte a entrada de estoque e cancela as contas a pagar pendentes desta nota. ` +
      `A NF-e volta para conciliação (você pode refazer ou descartar).`,
    )) return;
    try {
      const r = await api.estornarEntradaNfe(n.id) as { compraNumero?: number };
      emitirToast({
        tipo: "sucesso", titulo: "Importação estornada",
        mensagem: `Compra #${r.compraNumero ?? ""} revertida. A NF-e voltou para conciliação.`, duracao: 7000,
      });
      carregar();
    } catch (e) { flashErro(e); }
  }

  async function sincronizar() {
    setSincronizando(true);
    try {
      const r = await api.sincronizarDfe() as { novos?: number };
      emitirToast({
        tipo: r.novos ? "sucesso" : "info", titulo: "Sincronizado",
        mensagem: r.novos ? `${r.novos} nova(s) nota(s) recebida(s) da SEFAZ.` : "Nenhuma nota nova.",
      });
      carregarDFe();
    } catch (e) { flashErro(e); }
    finally { setSincronizando(false); }
  }

  async function baixarDoc(d: DocDFe) {
    setAcaoDfe(d.id);
    try {
      const r = await api.baixarDfe(d.id) as { notaEntradaId?: string };
      carregarDFe(); carregar();
      if (r.notaEntradaId) {
        emitirToast({ tipo: "sucesso", titulo: "XML baixado", mensagem: "Confira e vincule os produtos." });
        abrirConciliacao(r.notaEntradaId);
      }
    } catch (e) { flashErro(e); }
    finally { setAcaoDfe(null); }
  }

  async function ignorarDoc(d: DocDFe) {
    if (!confirm(`Ignorar a nota de ${d.emitenteNome || d.emitenteCnpj || "?"}?`)) return;
    setAcaoDfe(d.id);
    try { await api.ignorarDfe(d.id); carregarDFe(); }
    catch (e) { flashErro(e); }
    finally { setAcaoDfe(null); }
  }

  if (selecionada) {
    return (
      <ConciliacaoView
        detalhe={selecionada}
        produtos={produtos}
        fornecedores={fornecedores}
        podeEfetivar={podeGerenciar}
        onCriarFornecedor={async (dados) => {
          const f = await api.criarFornecedor(dados) as Fornecedor;
          setFornecedores((prev) => [f, ...prev]);
          return f;
        }}
        onVoltar={() => { setSelecionada(null); carregar(); }}
        onEfetivada={() => { setSelecionada(null); carregar(); }}
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <button onClick={() => setAba("xml")} style={aba === "xml" ? tabAtiva : tabInativa}>Importar XML</button>
        <button onClick={() => setAba("sefaz")} style={aba === "sefaz" ? tabAtiva : tabInativa}>Recebidas da SEFAZ</button>
      </div>

      {aba === "xml" && (
      <>
      {erro && <div style={alerta(C.red)}>{erro}</div>}

      {/* Upload — clique ou arraste o XML */}
      <div
        onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
        onClick={() => !enviando && escolherArquivo()}
        style={{
          ...uploadCard,
          cursor: enviando ? "default" : "pointer",
          borderStyle: "dashed",
          borderColor: arrastando ? C.accent : C.border,
          background: arrastando ? C.accent + "14" : C.card,
        }}
      >
        <div style={{ fontSize: 26 }}>{arrastando ? "📂" : "📥"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>
            {arrastando ? "Solte o XML aqui" : "Importar NF-e de compra"}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            Clique para selecionar ou <b>arraste o arquivo XML</b> da nota do fornecedor. Validamos antes de qualquer lançamento.
          </div>
          {erroUpload && <div style={{ ...alerta(C.red), marginTop: 10, marginBottom: 0 }}>{erroUpload}</div>}
        </div>
        <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" onChange={onArquivo} style={{ display: "none" }} />
        <button
          onClick={(e) => { e.stopPropagation(); escolherArquivo(); }}
          disabled={enviando}
          style={{ ...btnPrimario, opacity: enviando ? 0.6 : 1 }}
        >
          {enviando ? "Validando…" : "Selecionar XML"}
        </button>
      </div>

      {carregando ? (
        <div style={{ color: C.muted, fontSize: 13, padding: 16 }}>Carregando…</div>
      ) : lista.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13, padding: 16 }}>Nenhuma NF-e de entrada ainda. Importe um XML acima.</div>
      ) : (
        <div style={tabelaWrap}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: C.muted, textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
                <th style={th}>Fornecedor</th>
                <th style={th}>Nº / Série</th>
                <th style={th}>Emissão</th>
                <th style={{ ...th, textAlign: "right" }}>Valor</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((n) => (
                <tr key={n.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{n.emitenteNome || "—"}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{n.emitenteCnpj || ""}</div>
                  </td>
                  <td style={td}>{n.numero || "—"}{n.serie ? ` / ${n.serie}` : ""}</td>
                  <td style={td}>{n.dataEmissao ? fmtData(n.dataEmissao) : "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{n.valorTotal != null ? fmtBRL(n.valorTotal) : "—"}</td>
                  <td style={td}><span style={badge(STATUS_COR[n.status] || C.muted)}>{n.status}</span></td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    {n.status === "RECEBIDA" && (
                      <>
                        <button style={btnMini} onClick={() => abrirConciliacao(n.id)}>Conciliar</button>
                        {podeGerenciar && <button style={btnMiniPerigo} onClick={() => descartar(n)}>Descartar</button>}
                      </>
                    )}
                    {n.status === "IMPORTADA" && (
                      <>
                        <span style={{ fontSize: 11, color: C.green, marginRight: 6 }}>✓ virou compra</span>
                        {podeGerenciar && <button style={btnMiniPerigo} onClick={() => estornar(n)}>Estornar</button>}
                      </>
                    )}
                    {n.status === "DESCARTADA" && <span style={{ fontSize: 11, color: C.muted }}>descartada</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}

      {aba === "sefaz" && (
        <>
          <div style={{ ...uploadCard, justifyContent: "space-between", borderStyle: "solid", cursor: "default" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Notas recebidas da SEFAZ</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                NF-es que fornecedores emitiram contra o seu CNPJ. Baixe o XML e concilie como uma entrada normal.
              </div>
            </div>
            {podeGerenciar && (
              <button onClick={sincronizar} disabled={sincronizando} style={{ ...btnPrimario, opacity: sincronizando ? 0.6 : 1 }}>
                {sincronizando ? "Buscando…" : "🔄 Sincronizar agora"}
              </button>
            )}
          </div>

          {carregandoDFe ? (
            <div style={{ color: C.muted, fontSize: 13, padding: 16 }}>Carregando…</div>
          ) : docsDFe.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13, padding: 16 }}>Nenhuma nota recebida. Clique em “Sincronizar agora”.</div>
          ) : (
            <div style={tabelaWrap}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: C.muted, textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
                    <th style={th}>Fornecedor</th>
                    <th style={th}>Emissão</th>
                    <th style={{ ...th, textAlign: "right" }}>Valor</th>
                    <th style={th}>Status</th>
                    <th style={{ ...th, textAlign: "right" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {docsDFe.map((d) => (
                    <tr key={d.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{d.emitenteNome || "—"}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>{d.emitenteCnpj || ""}</div>
                      </td>
                      <td style={td}>{d.dataEmissao ? fmtData(d.dataEmissao) : "—"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{d.valorTotal != null ? fmtBRL(d.valorTotal) : "—"}</td>
                      <td style={td}>
                        <span style={badge(STATUS_DFE_COR[d.status] || C.muted)}>
                          {d.status === "XML_BAIXADO" ? "baixada" : d.status === "PENDENTE" ? "nova" : "ignorada"}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        {d.status === "PENDENTE" && podeGerenciar && (
                          <>
                            <button style={btnMini} disabled={acaoDfe === d.id} onClick={() => baixarDoc(d)}>
                              {acaoDfe === d.id ? "…" : "Baixar e conciliar"}
                            </button>
                            <button style={btnMiniPerigo} disabled={acaoDfe === d.id} onClick={() => ignorarDoc(d)}>Ignorar</button>
                          </>
                        )}
                        {d.status === "XML_BAIXADO" && <span style={{ fontSize: 11, color: C.green }}>✓ baixada → aba “Importar XML”</span>}
                        {d.status === "IGNORADO" && <span style={{ fontSize: 11, color: C.muted }}>ignorada</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============ Tela de conciliação (de-para) ============
function ConciliacaoView({
  detalhe, produtos, fornecedores, podeEfetivar, onVoltar, onEfetivada, onCriarFornecedor,
}: {
  detalhe: Detalhe;
  produtos: Produto[];
  fornecedores: Fornecedor[];
  podeEfetivar: boolean;
  onVoltar: () => void;
  onEfetivada: () => void;
  onCriarFornecedor: (dados: unknown) => Promise<Fornecedor>;
}) {
  const nota = detalhe.nota;
  const itens = detalhe.conciliacao?.itens || [];

  // vinculos[numero] = produtoId; precos[numero] = custo
  const [vinculos, setVinculos] = useState<Record<number, string>>(() => {
    const v: Record<number, string> = {};
    for (const it of itens) v[it.numero] = it.sugestao?.produtoIdSugerido || "";
    return v;
  });
  const [precos, setPrecos] = useState<Record<number, string>>(() => {
    const p: Record<number, string> = {};
    for (const it of itens) p[it.numero] = String(it.valorUnitario ?? "");
    return p;
  });
  const [fornecedorSel, setFornecedorSel] = useState(nota.fornecedorId || "");
  const [efetivando, setEfetivando] = useState(false);
  const [criandoForn, setCriandoForn] = useState(false);

  const fornecedorMatch = useMemo(
    () => fornecedores.find((f) => f.id === fornecedorSel) || null,
    [fornecedores, fornecedorSel],
  );
  const pendentes = itens.filter((it) => !vinculos[it.numero]).length;
  const vinculados = itens.length - pendentes;
  const podeEnviar = podeEfetivar && !!fornecedorSel && pendentes === 0 && itens.length > 0;

  const produtosPorId = useMemo(() => {
    const m: Record<string, Produto> = {};
    for (const p of produtos) m[p.id] = p;
    return m;
  }, [produtos]);

  // Reconciliacao: soma (qtd x custo) dos itens vs total da NF-e — pega custo
  // digitado errado antes de efetivar.
  const totalItens = useMemo(
    () => itens.reduce((s, it) => s + Number(it.quantidade) * (Number(precos[it.numero]) || 0), 0),
    [itens, precos],
  );
  const notaTotal = Number(nota.valorTotal) || 0;
  const divergente = Math.abs(totalItens - notaTotal) > 0.01;
  const contasCount = nota.dadosJson?.duplicatas?.length || 0;

  function flashErro(e: unknown) {
    emitirToast({ tipo: "erro", titulo: "Erro", mensagem: (e as Error).message, duracao: 8000 });
  }

  async function criarFornecedorDaNota() {
    setCriandoForn(true);
    try {
      const f = await onCriarFornecedor({
        nome: nota.emitenteNome || `Fornecedor ${nota.emitenteCnpj || ""}`.trim(),
        cnpj: nota.emitenteCnpj || null,
        tipoPessoa: "PJ",
      });
      setFornecedorSel(f.id);
      emitirToast({ tipo: "sucesso", titulo: "Fornecedor criado", mensagem: f.nome });
    } catch (e) { flashErro(e); }
    finally { setCriandoForn(false); }
  }

  async function efetivar() {
    if (!podeEnviar) return;
    setEfetivando(true);
    try {
      const payloadItens = itens.map((it) => ({
        numero: it.numero,
        produtoId: vinculos[it.numero],
        precoUnitario: precos[it.numero] !== "" ? Number(precos[it.numero]) : undefined,
      }));
      const r = await api.efetivarEntradaNfe(nota.id, { fornecedorId: fornecedorSel, itens: payloadItens }) as {
        compra?: { numero?: number }; contasGeradas?: number;
      };
      emitirToast({
        tipo: "sucesso", titulo: "NF-e importada",
        mensagem: `Compra #${r.compra?.numero ?? ""} criada${r.contasGeradas ? ` · ${r.contasGeradas} conta(s) a pagar` : ""}.`,
        duracao: 7000,
      });
      onEfetivada();
    } catch (e) { flashErro(e); }
    finally { setEfetivando(false); }
  }

  return (
    <div style={{ paddingBottom: 8 }}>
      <button onClick={onVoltar} style={{ ...btnGhost, marginBottom: 14 }}>← Voltar</button>

      {/* Cabeçalho da NF-e */}
      <div style={cardInfo}>
        <div>
          <div style={rotulo}>Fornecedor (emitente)</div>
          <div style={{ fontWeight: 700, lineHeight: 1.3 }}>{nota.emitenteNome || "—"}</div>
          <div style={{ fontSize: 12, color: C.muted }}>{nota.emitenteCnpj || ""}</div>
        </div>
        <div>
          <div style={rotulo}>NF-e nº</div>
          <div style={{ fontWeight: 700 }}>{nota.numero || "—"}{nota.serie ? ` / ${nota.serie}` : ""}</div>
        </div>
        <div>
          <div style={rotulo}>Valor total</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{nota.valorTotal != null ? fmtBRL(nota.valorTotal) : "—"}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={rotulo}>Chave de acesso</div>
          <div style={{ fontSize: 11, fontFamily: "monospace", wordBreak: "break-all", color: C.muted }}>{nota.chaveAcesso}</div>
        </div>
      </div>

      {/* Passo 1 — Fornecedor (estado resolvido) */}
      <div style={fornecedorMatch ? cardOk : cardWarn}>
        <span style={{ fontSize: 20, lineHeight: 1 }}>{fornecedorMatch ? "✓" : "⚠️"}</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: fornecedorMatch ? C.green : C.yellow }}>
            {fornecedorMatch ? "Fornecedor reconhecido pelo CNPJ" : "Fornecedor não encontrado no seu cadastro"}
          </div>
          <select
            title="Vincular ao fornecedor"
            aria-label="Vincular ao fornecedor"
            value={fornecedorSel}
            onChange={(e) => setFornecedorSel(e.target.value)}
            style={{ ...inputBase, maxWidth: 460, marginTop: 6 }}
          >
            <option value="">— selecione o fornecedor —</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>{f.nome}{f.cnpj ? ` (${f.cnpj})` : ""}</option>
            ))}
          </select>
        </div>
        {!fornecedorMatch && nota.emitenteCnpj && (
          <button onClick={criarFornecedorDaNota} disabled={criandoForn} style={{ ...btnPrimario, opacity: criandoForn ? 0.6 : 1 }}>
            {criandoForn ? "Criando…" : "Criar da NF-e"}
          </button>
        )}
      </div>

      {/* Passo 2 — Itens */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "18px 2px 8px", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Conferência dos itens</div>
        <div style={{ fontSize: 12, color: pendentes ? C.yellow : C.green, fontWeight: 600 }}>
          {pendentes ? `${vinculados} de ${itens.length} vinculados · ${pendentes} pendente(s)` : `${itens.length} de ${itens.length} já vinculados ✓`}
        </div>
      </div>

      <div style={tabelaWrap}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: C.muted, textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
              <th style={{ ...th, width: 28 }} aria-label="Situação do vínculo"></th>
              <th style={th}>Item da NF-e</th>
              <th style={th}>NCM</th>
              <th style={{ ...th, textAlign: "right" }}>Qtd</th>
              <th style={{ ...th, textAlign: "right" }}>Custo un.</th>
              <th style={th}>Vincular ao produto</th>
              <th style={{ ...th, textAlign: "right" }}>Estoque</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it) => {
              const semVinculo = !vinculos[it.numero];
              const prodSel = vinculos[it.numero] ? produtosPorId[vinculos[it.numero]] : null;
              const estoqueAtual = prodSel && prodSel.estoque != null ? Number(prodSel.estoque) : null;
              const estoqueNovo = estoqueAtual != null ? estoqueAtual + Number(it.quantidade) : null;
              const ehSugerido = it.sugestao && it.sugestao.origem !== "NENHUM" && vinculos[it.numero] === it.sugestao.produtoIdSugerido;
              return (
                <tr key={it.numero} style={{ borderBottom: `1px solid ${C.border}`, background: semVinculo ? C.yellow + "14" : undefined }}>
                  <td style={{ ...td, textAlign: "center" }}>
                    <span style={{ color: semVinculo ? C.yellow : C.green, fontWeight: 700 }}>{semVinculo ? "!" : "✓"}</span>
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{it.descricao || `Item ${it.numero}`}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>
                      cód. forn.: {it.cProdFornecedor || "—"}{it.cEAN ? ` · GTIN ${it.cEAN}` : ""}
                    </div>
                  </td>
                  <td style={td}>{it.ncm || "—"}</td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <b>{fmtQtd(Number(it.quantidade))}</b> <span style={{ color: C.muted, fontSize: 11 }}>{it.unidade || ""}</span>
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <div style={custoWrap}>
                      <span style={{ color: C.muted, fontSize: 12 }}>R$</span>
                      <input
                        type="number" step="0.01" min="0" inputMode="decimal"
                        title={`Custo unitário — ${it.descricao || `item ${it.numero}`}`}
                        aria-label="Custo unitário"
                        value={precos[it.numero] ?? ""}
                        onChange={(e) => setPrecos((p) => ({ ...p, [it.numero]: e.target.value }))}
                        style={custoInput}
                      />
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <ProdutoPicker
                        produtos={produtos}
                        value={vinculos[it.numero] || ""}
                        invalido={semVinculo}
                        onChange={(id) => setVinculos((v) => ({ ...v, [it.numero]: id }))}
                      />
                      {ehSugerido && (
                        <span style={badge(C.accent)}>sugerido ({ORIGEM_LABEL[it.sugestao!.origem] || it.sugestao!.origem})</span>
                      )}
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    {estoqueAtual != null ? (
                      <span style={{ fontSize: 12 }}>
                        <span style={{ color: C.muted }}>{fmtQtd(estoqueAtual)}</span>
                        <span style={{ color: C.muted }}> → </span>
                        <b style={{ color: C.green }}>{fmtQtd(estoqueNovo!)}</b>
                      </span>
                    ) : <span style={{ color: C.muted }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {/* Reconciliação do total */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 14, padding: "10px 14px", borderTop: `1px solid ${C.border}`, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: C.muted }}>NF-e: {fmtBRL(notaTotal)}</span>
          <span style={{ fontSize: 13 }}>Soma dos itens: <b style={{ color: divergente ? C.yellow : C.text }}>{fmtBRL(totalItens)}</b></span>
          <span style={badge(divergente ? C.yellow : C.green)}>{divergente ? "conferir divergência" : "confere"}</span>
        </div>
      </div>

      {!podeEfetivar && (
        <div style={{ ...alerta(C.yellow), marginTop: 12 }}>Apenas ADMIN/GERENTE pode efetivar a importação.</div>
      )}

      {/* Barra de ação fixa */}
      <div style={stickyBar}>
        <div style={{ fontSize: 13, color: C.text }}>
          {!fornecedorSel ? (
            <span style={{ color: C.yellow }}>Selecione o fornecedor para continuar</span>
          ) : pendentes ? (
            <span style={{ color: C.yellow }}>{pendentes} item(ns) ainda sem produto vinculado</span>
          ) : (
            <span>
              <b>{itens.length} itens</b> · <b>{fmtBRL(totalItens)}</b>
              {contasCount ? <> · <b>{contasCount}</b> conta(s) a pagar</> : null}
            </span>
          )}
        </div>
        <button
          onClick={efetivar}
          disabled={!podeEnviar || efetivando}
          style={{ ...btnPrimario, padding: "11px 24px", opacity: !podeEnviar || efetivando ? 0.5 : 1, cursor: !podeEnviar || efetivando ? "not-allowed" : "pointer" }}
        >
          {efetivando ? "Importando…" : "Efetivar importação →"}
        </button>
      </div>
    </div>
  );
}

// Combobox de produto com busca — substitui o <select> nativo (catalogo grande).
// Dropdown em position:fixed p/ nao ser cortado pelo overflow da tabela.
function ProdutoPicker({ produtos, value, onChange, invalido }: {
  produtos: Produto[];
  value: string;
  onChange: (id: string) => void;
  invalido?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const sel = value ? produtos.find((p) => p.id === value) || null : null;

  function abrir() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setRect({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 300) });
    setBusca("");
    setAberto(true);
  }

  useEffect(() => {
    if (!aberto) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setAberto(false);
    }
    function onScroll(e: Event) {
      if (popRef.current?.contains(e.target as Node)) return; // scroll interno da lista
      setAberto(false);
    }
    function onResize() { setAberto(false); }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [aberto]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = q ? produtos.filter((p) => `${p.codigo} ${p.nome}`.toLowerCase().includes(q)) : produtos;
    return base.slice(0, 60);
  }, [produtos, busca]);

  function escolher(id: string) { onChange(id); setAberto(false); }

  return (
    <div style={{ position: "relative", minWidth: 240, flex: 1 }}>
      <button
        ref={btnRef} type="button" title="Vincular ao produto"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        style={{ ...inputBase, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderColor: invalido ? C.yellow + "99" : C.border }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: sel ? C.text : C.muted }}>
          {sel ? `${sel.codigo} — ${sel.nome}` : "— vincular —"}
        </span>
        <span style={{ color: C.muted, fontSize: 10 }}>▾</span>
      </button>
      {aberto && rect && (
        <div ref={popRef} style={{ ...comboPop, left: rect.left, top: rect.top, width: rect.width }}>
          <input
            autoFocus value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código ou nome…" title="Buscar produto"
            onKeyDown={(e) => { if (e.key === "Enter" && filtrados[0]) escolher(filtrados[0].id); if (e.key === "Escape") setAberto(false); }}
            style={{ ...inputBase, marginBottom: 6 }}
          />
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {value && (
              <button type="button" onClick={() => escolher("")} style={comboItem}>
                <span style={{ color: C.muted }}>— remover vínculo —</span>
              </button>
            )}
            {filtrados.length === 0 ? (
              <div style={{ padding: 8, color: C.muted, fontSize: 12 }}>Nenhum produto encontrado.</div>
            ) : filtrados.map((p) => (
              <button type="button" key={p.id} onClick={() => escolher(p.id)} style={{ ...comboItem, background: p.id === value ? C.accent + "22" : "transparent" }}>
                <b>{p.codigo}</b> — {p.nome}
                {p.estoque != null && <span style={{ color: C.muted, fontSize: 11 }}> · est. {fmtQtd(Number(p.estoque))}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ estilos ============
const th: CSSProperties = { padding: "10px 12px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" };
const td: CSSProperties = { padding: "10px 12px", color: C.text, verticalAlign: "top" };
const tabelaWrap: CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", overflowX: "auto" };
const uploadCard: CSSProperties = { display: "flex", alignItems: "center", gap: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16, flexWrap: "wrap" };
const cardInfo: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 };
const rotulo: CSSProperties = { fontSize: 11, color: C.muted, marginBottom: 2, fontWeight: 600 };
const cardOk: CSSProperties = { display: "flex", alignItems: "center", gap: 12, background: C.green + "14", border: `1px solid ${C.green}55`, borderRadius: 12, padding: 14, flexWrap: "wrap" };
const cardWarn: CSSProperties = { display: "flex", alignItems: "center", gap: 12, background: C.yellow + "14", border: `1px solid ${C.yellow}55`, borderRadius: 12, padding: 14, flexWrap: "wrap" };
const custoWrap: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 8px" };
const custoInput: CSSProperties = { width: 78, background: "transparent", border: "none", color: C.text, fontSize: 13, padding: "7px 0", textAlign: "right", outline: "none" };
const stickyBar: CSSProperties = { position: "sticky", bottom: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 16, padding: "12px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 -6px 20px rgba(0,0,0,.25)", zIndex: 5 };
const comboPop: CSSProperties = { position: "fixed", zIndex: 1000, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 8, boxShadow: "0 12px 30px rgba(0,0,0,.4)" };
const comboItem: CSSProperties = { display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", color: C.text, fontSize: 13, padding: "7px 8px", borderRadius: 6, cursor: "pointer" };
const tabBase: CSSProperties = { borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const tabAtiva: CSSProperties = { ...tabBase, background: C.accent + "22", border: `1px solid ${C.accent}66`, color: C.accent };
const tabInativa: CSSProperties = { ...tabBase, background: C.surface, border: `1px solid ${C.border}`, color: C.muted };
const inputBase: CSSProperties = { width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" };
const btnPrimario: CSSProperties = { background: C.accent, border: `1px solid ${C.accent}`, color: "var(--accent-ink)", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const btnGhost: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const btnMini: CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", marginLeft: 4, color: C.text };
const btnMiniPerigo: CSSProperties = { ...btnMini, border: `1px solid ${C.red}55`, color: C.red };

function badge(cor: string): CSSProperties {
  return { fontSize: 10, padding: "2px 8px", borderRadius: 999, background: cor + "22", color: cor, border: `1px solid ${cor}55`, fontWeight: 700, whiteSpace: "nowrap" };
}
function alerta(cor: string): CSSProperties {
  return { marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: cor + "22", border: `1px solid ${cor}55`, color: cor, fontSize: 13 };
}
