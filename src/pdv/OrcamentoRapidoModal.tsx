// @ts-nocheck — extraido verbatim de monolito; tipagem fina em etapa propria.
// Converte o carrinho atual em um orcamento (status RASCUNHO) e gera o link
// de envio por WhatsApp ou e-mail com o resumo do orcamento. A cestinha
// continua intacta — e um passo pre-venda, nao substitui o fechamento.
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { useModalKeys } from "../lib/modalKeys";
import { formatarEndereco } from "../HeaderRelatorio";
import { gerarLink } from "../lib/templates";
import { fmtBRL, fmtQtd } from "./comum";

export default function OrcamentoRapidoModal({
  carrinho, subtotal, desconto, total, clientes, clienteId, empresa, user,
  podeEnviar, onFechar, onSucesso,
}) {
  const clienteSel = useMemo(
    () => clientes.find(c => c.id === clienteId) || null,
    [clientes, clienteId],
  );

  const [nome, setNome] = useState(clienteSel?.nome || "");
  const [telefone, setTelefone] = useState(clienteSel?.telefone || "");
  const [email, setEmail] = useState(clienteSel?.email || "");
  const [validadeDias, setValidadeDias] = useState("7");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useModalKeys(true, { onClose: () => !salvando && onFechar() });

  // Monta o texto do orcamento. Usa a marcacao do WhatsApp (*negrito*,
  // _italico_) para um cupom visual; para EMAIL os marcadores sao removidos
  // (o corpo do mailto e texto puro e exibiria os asteriscos literalmente).
  function montarMensagem(numero, canal) {
    const empresaNome = (empresa?.nomeFantasia || empresa?.razaoSocial || "GestãoProMax").trim();
    const sep = "━━━━━━━━━━━━━━━━━━";
    const L = [];

    // Cabeçalho
    L.push(`🧾 *ORÇAMENTO Nº ${numero}*`);
    L.push(`*${empresaNome}*`);
    if (empresa?.cnpj) L.push(`CNPJ: ${empresa.cnpj}`);
    const endereco = formatarEndereco(empresa);
    if (endereco) L.push(`📍 ${endereco}`);
    const contato = [empresa?.telefone, empresa?.email].filter(Boolean).join("  ·  ");
    if (contato) L.push(contato);
    L.push("");

    // Dados do orçamento
    L.push(sep);
    if (nome.trim()) L.push(`👤 *Cliente:* ${nome.trim()}`);
    L.push(`📅 *Data:* ${new Date().toLocaleDateString("pt-BR")}`);
    const dias = parseInt(validadeDias, 10);
    if (Number.isFinite(dias) && dias > 0) {
      L.push(`⏳ *Validade:* ${dias} ${dias === 1 ? "dia" : "dias"}`);
    }
    L.push(sep);
    L.push("");

    // Itens
    L.push("🛒 *ITENS*");
    L.push("");
    carrinho.forEach((it, i) => {
      const sub = it.quantidade * it.precoUnitario;
      const un = (it.unidade || "un").toString();
      L.push(`*${i + 1}.* ${it.nome}`);
      L.push(`${fmtQtd(it.quantidade)} ${un} × ${fmtBRL(it.precoUnitario)} = *${fmtBRL(sub)}*`);
      L.push("");
    });

    // Totais
    L.push(sep);
    L.push(`Subtotal:  ${fmtBRL(subtotal)}`);
    if (desconto > 0) L.push(`Desconto:  -${fmtBRL(desconto)}`);
    L.push(`💰 *TOTAL:  ${fmtBRL(total)}*`);
    L.push(sep);

    // Observações
    if (observacoes.trim()) {
      L.push("");
      L.push("📝 *Observações:*");
      L.push(observacoes.trim());
    }

    L.push("");
    if (user?.nome) L.push(`_Atendido por: ${user.nome}_`);
    L.push("_Obrigado pela preferência!_ 🙏");

    let txt = L.join("\n");
    if (canal === "EMAIL") txt = txt.replace(/[*_]/g, "");
    return txt;
  }

  // Cria o orcamento no backend e (se houver canal) abre o link de envio.
  async function gerar(canal) {
    setErro("");
    if (!podeEnviar) {
      setErro("Sem conexão com o servidor. Tente novamente quando a conexão voltar.");
      return;
    }
    if (carrinho.length === 0) { setErro("Carrinho vazio."); return; }
    if (canal === "WHATSAPP" && !String(telefone).replace(/\D/g, "")) {
      setErro("Informe um telefone para enviar por WhatsApp.");
      return;
    }
    if (canal === "EMAIL" && !email.trim()) {
      setErro("Informe um e-mail para enviar por e-mail.");
      return;
    }

    const dias = parseInt(validadeDias, 10);
    const notaValidade = Number.isFinite(dias) && dias > 0
      ? `Validade do orçamento: ${dias} ${dias === 1 ? "dia" : "dias"}.`
      : "";
    const obsFinal = [observacoes.trim(), notaValidade].filter(Boolean).join(" ") || null;

    setSalvando(true);
    try {
      const orc = await api.criarOrcamento({
        tipo: "ORCAMENTO",
        tabelaPreco: "AV",
        clienteId: clienteId || null,
        descricaoCliente: nome.trim() || "Consumidor",
        telefone: telefone || null,
        desconto,
        observacoes: obsFinal,
        itens: carrinho.map((it, idx) => ({
          produtoId: it.produtoId,
          descricao: it.nome,
          quantidade: it.quantidade,
          valorUnitario: it.precoUnitario,
          ordem: idx,
        })),
      });

      if (canal) {
        const corpo = montarMensagem(orc.numero, canal);
        const link = gerarLink({
          tipo: canal,
          telefone,
          email,
          assunto: `Orçamento Nº ${orc.numero} — ${(empresa?.nomeFantasia || empresa?.razaoSocial || "GestãoProMax").trim()}`,
          corpo,
        });
        if (link) window.open(link, "_blank", "noopener,noreferrer");
      }

      const via = canal === "WHATSAPP" ? " — abrindo WhatsApp"
        : canal === "EMAIL" ? " — abrindo e-mail"
        : "";
      onSucesso(`Orçamento #${orc.numero} (${fmtBRL(total)}) salvo${via}. Veja em Orçamentos.`);
    } catch (err) {
      setErro(err.message || "Falha ao gerar o orçamento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onFechar()} className="pdv-modal-bg">
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" className="pdv-modal" style={{ width: "min(540px, calc(100vw - 32px))" }}>
        <div className="pdv-modal-hd">
          <div>
            <div className="pdv-modal-title">Orçamento rápido</div>
            <div className="pdv-modal-sub">
              {carrinho.length} {carrinho.length === 1 ? "item" : "itens"} · {fmtBRL(total)} — envie por WhatsApp ou e-mail
            </div>
          </div>
          <button type="button" onClick={() => !salvando && onFechar()} aria-label="Fechar" className="pdv-modal-x">×</button>
        </div>

        <div className="pdv-modal-body" style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 12 }}>
          <div>
            <label className="pdv-field-label">Cliente</label>
            <input
              className="pdv-field-input"
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Nome do cliente (opcional)"
              maxLength={200}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className="pdv-field-label">Telefone (WhatsApp)</label>
              <input
                className="pdv-field-input"
                value={telefone}
                onChange={e => setTelefone(e.target.value)}
                placeholder="(00) 00000-0000"
                maxLength={50}
              />
            </div>
            <div>
              <label className="pdv-field-label">E-mail</label>
              <input
                className="pdv-field-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="cliente@email.com"
                maxLength={200}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
            <div>
              <label className="pdv-field-label">Validade (dias)</label>
              <input
                className="pdv-field-input"
                type="number" min="0" step="1"
                value={validadeDias}
                onChange={e => setValidadeDias(e.target.value)}
              />
            </div>
            <div>
              <label className="pdv-field-label">Observações</label>
              <input
                className="pdv-field-input"
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                placeholder="Ex.: condições de pagamento, prazo de entrega…"
                maxLength={500}
              />
            </div>
          </div>

          {/* Resumo dos itens */}
          <div style={{
            border: "1px solid var(--pdv-line)", borderRadius: 10, padding: "10px 12px",
            background: "var(--pdv-surface, rgba(255,255,255,.02))", maxHeight: 180, overflowY: "auto",
          }}>
            {carrinho.map(it => (
              <div key={it.produtoId} style={{
                display: "flex", justifyContent: "space-between", gap: 10,
                fontSize: 12.5, color: "var(--pdv-t2)", padding: "3px 0",
              }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {fmtQtd(it.quantidade)}× {it.nome}
                </span>
                <span style={{ flexShrink: 0, color: "var(--pdv-t1)" }}>{fmtBRL(it.quantidade * it.precoUnitario)}</span>
              </div>
            ))}
            <div style={{
              display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6,
              borderTop: "1px dashed var(--pdv-line)", fontWeight: 700, color: "var(--pdv-t1)", fontSize: 13.5,
            }}>
              <span>Total</span><span>{fmtBRL(total)}</span>
            </div>
          </div>

          {erro && <div className="pdv-erro-inline">{erro}</div>}
        </div>

        <div className="pdv-modal-foot" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <button type="button" onClick={() => !salvando && onFechar()} className="pdv-btn-ghost" disabled={salvando}>
            Cancelar <span className="pdv-kbd is-warn">Esc</span>
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => gerar(null)}
              disabled={salvando}
              className="pdv-btn-rm"
              title="Apenas salvar o orçamento (sem enviar)"
            >
              {salvando ? "Salvando…" : "Só salvar"}
            </button>
            <button
              type="button"
              onClick={() => gerar("EMAIL")}
              disabled={salvando}
              className="pdv-btn-rm"
              style={{ color: "var(--pdv-c-violet, #a78bfa)", borderColor: "rgba(167,139,250,.4)" }}
            >
              ✉️ E-mail
            </button>
            <button
              type="button"
              onClick={() => gerar("WHATSAPP")}
              disabled={salvando}
              className="pdv-btn-rm"
              style={{ color: "var(--pdv-c-emerald, #22c55e)", borderColor: "rgba(34,197,94,.4)" }}
            >
              💬 WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
