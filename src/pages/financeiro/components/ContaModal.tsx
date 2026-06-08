import { useEffect, useMemo, useState } from "react";
import { FormularioLuxuoso, Secao, Linha, Campo } from "../../../components/FormularioLuxuoso";
import { C } from "../../../lib/theme";
import { api } from "../../../lib/api";

interface Entidade { id: string; nome: string }
interface Categoria { id: string; codigo: string; nome: string }
interface Conta {
  id: string;
  descricao?: string;
  valor?: number | string;
  valorBruto?: number | string | null;
  juros?: number | string | null;
  multa?: number | string | null;
  desconto?: number | string | null;
  vencimento?: string;
  fornecedorId?: string;
  clienteId?: string;
  planoContaId?: string | null;
  observacoes?: string | null;
}

type TipoConta = "pagar" | "receber";
type TipoRecorrencia = "NENHUMA" | "PARCELADA" | "RECORRENTE";

interface ContaModalProps {
  tipo: TipoConta;
  conta?: Conta | null;
  entidades?: Entidade[];
  onCancelar: () => void;
  onSalvar: () => void;
}

function fmtBRL(n: number): string {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseNum(v: string): number {
  return parseFloat(v.replace(",", ".")) || 0;
}

function mix(cor: string, pct: number): string {
  return `color-mix(in srgb, ${cor} ${pct}%, transparent)`;
}

export default function ContaModal({
  tipo, conta, entidades = [], onCancelar, onSalvar,
}: ContaModalProps) {
  const ehPagar = tipo === "pagar";
  const editar = !!conta;

  const [descricao, setDescricao] = useState(conta?.descricao || "");
  const [valorBruto, setValorBruto] = useState(
    conta?.valorBruto != null ? String(conta.valorBruto)
      : conta?.valor != null ? String(conta.valor) : ""
  );
  const [juros, setJuros] = useState(conta?.juros ? String(conta.juros) : "");
  const [multa, setMulta] = useState(conta?.multa ? String(conta.multa) : "");
  const [desconto, setDesconto] = useState(conta?.desconto ? String(conta.desconto) : "");
  const [vencimento, setVencimento] = useState(
    conta?.vencimento ? new Date(conta.vencimento).toISOString().slice(0, 10) : ""
  );
  const [entidadeId, setEntidadeId] = useState(
    (ehPagar ? conta?.fornecedorId : conta?.clienteId) || ""
  );
  const [planoContaId, setPlanoContaId] = useState(conta?.planoContaId || "");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [observacoes, setObservacoes] = useState(conta?.observacoes || "");
  const [tipoRecorrencia, setTipoRecorrencia] = useState<TipoRecorrencia>("NENHUMA");
  const [parcelaTotal, setParcelaTotal] = useState("3");
  const [entrada, setEntrada] = useState("");
  const [entradaForma, setEntradaForma] = useState("DINHEIRO");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Categoria (Plano de Contas) só se aplica a contas a pagar — usa as mesmas
  // contas analíticas de DESPESA do módulo de Despesas, mantendo a classificação
  // unificada entre os dois módulos.
  useEffect(() => {
    if (!ehPagar) return;
    api.listarPlanosContas({ natureza: "DESPESA", analitica: "true", ativo: "true" })
      .then(d => setCategorias((d as Categoria[]) || []))
      .catch(() => {});
  }, [ehPagar]);

  // Entrada à vista só faz sentido em conta parcelada (pagar ou receber).
  const usaEntrada = tipoRecorrencia === "PARCELADA";

  const liquido = useMemo(
    () => parseNum(valorBruto) + parseNum(juros) + parseNum(multa) - parseNum(desconto),
    [valorBruto, juros, multa, desconto]
  );
  // Montante que será parcelado (valor bruto menos a entrada, quando houver).
  const restanteParcelar = useMemo(() => {
    if (!usaEntrada) return parseNum(valorBruto);
    return Math.max(0, parseNum(valorBruto) - parseNum(entrada));
  }, [usaEntrada, valorBruto, entrada]);
  const valorParcela = useMemo(() => {
    if (tipoRecorrencia === "NENHUMA") return null;
    const total = parseInt(parcelaTotal, 10);
    const vb = parseNum(valorBruto);
    if (!total || total < 2 || vb <= 0) return null;
    if (tipoRecorrencia === "PARCELADA") return restanteParcelar / total;
    return vb;
  }, [tipoRecorrencia, parcelaTotal, valorBruto, restanteParcelar]);

  // Progresso do preenchimento (campos essenciais), p/ a barra do FormularioLuxuoso.
  const progresso = useMemo(() => {
    const req = [
      !!descricao.trim(),
      parseNum(valorBruto) > 0,
      !!vencimento,
      ehPagar ? !!planoContaId : true,
    ];
    return (req.filter(Boolean).length / req.length) * 100;
  }, [descricao, valorBruto, vencimento, planoContaId, ehPagar]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!descricao.trim()) { setErro("Descrição é obrigatória"); return; }
    const vb = parseNum(valorBruto);
    if (!Number.isFinite(vb) || vb <= 0) { setErro("Valor bruto deve ser maior que zero"); return; }
    if (!vencimento) { setErro("Vencimento é obrigatório"); return; }
    if (liquido <= 0) { setErro("Valor líquido (bruto + juros + multa − desconto) deve ser maior que zero"); return; }
    if (ehPagar && !planoContaId) { setErro("Categoria é obrigatória"); return; }

    const payload: Record<string, unknown> = {
      descricao,
      valorBruto: vb,
      juros: parseNum(juros),
      multa: parseNum(multa),
      desconto: parseNum(desconto),
      vencimento,
      observacoes: observacoes || null,
    };
    if (ehPagar) {
      payload.fornecedorId = entidadeId || null;
      payload.planoContaId = planoContaId;
    } else {
      payload.clienteId = entidadeId || null;
    }

    if (!editar && tipoRecorrencia !== "NENHUMA") {
      payload.tipoRecorrencia = tipoRecorrencia;
      const total = parseInt(parcelaTotal, 10);
      if (!total || total < 2 || total > 60) { setErro("Número de parcelas deve estar entre 2 e 60"); return; }
      payload.parcelaTotal = total;

      if (usaEntrada) {
        const ent = parseNum(entrada);
        if (ent < 0) { setErro("Entrada não pode ser negativa"); return; }
        if (ent >= vb) { setErro("A entrada deve ser menor que o valor total"); return; }
        if (ent > 0) {
          payload.entrada = ent;
          payload.entradaForma = entradaForma;
        }
      }
    }

    setSalvando(true);
    try {
      if (editar && conta) {
        if (ehPagar) await api.atualizarContaPagar(conta.id, payload);
        else await api.atualizarContaReceber(conta.id, payload);
      } else {
        if (ehPagar) await api.criarContaPagar(payload);
        else await api.criarContaReceber(payload);
      }
      onSalvar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const entidadeLabel = ehPagar ? "Fornecedor" : "Cliente";

  return (
    <FormularioLuxuoso
      aberto
      onFechar={() => !salvando && onCancelar()}
      onSubmit={salvar}
      titulo={editar ? "Editar" : "Nova"}
      tituloDestaque={ehPagar ? "conta a pagar" : "conta a receber"}
      subtitulo={
        ehPagar
          ? "Despesa · pagamento. Campos marcados com • são obrigatórios."
          : "Receita · recebimento. Campos marcados com • são obrigatórios."
      }
      eyebrow={ehPagar ? "Financeiro · A pagar" : "Financeiro · A receber"}
      data={new Date().toLocaleDateString("pt-BR")}
      progresso={progresso}
      salvando={salvando}
      textoSalvar={editar ? "Salvar alterações" : "Criar conta"}
      editando={editar}
      erro={erro}
      larguraMax={680}
      compacto
    >
      <Secao legenda="Lançamento">
        <Linha cols={1}>
          <Campo label="Descrição" obrigatorio>
            <input
              className="lux-input"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Ex.: Aluguel, Energia, NF #123…"
              autoFocus
            />
          </Campo>
        </Linha>
        <Linha style={{ gridTemplateColumns: "1fr 200px" }}>
          <Campo label="Valor bruto" obrigatorio>
            <input
              className="lux-input"
              type="number" step="0.01" min="0.01" inputMode="decimal"
              value={valorBruto}
              onChange={e => setValorBruto(e.target.value)}
              placeholder="0,00"
            />
          </Campo>
          <Campo label="Vencimento" obrigatorio>
            <input
              className="lux-input"
              type="date"
              aria-label="Vencimento"
              value={vencimento}
              onChange={e => setVencimento(e.target.value)}
            />
          </Campo>
        </Linha>
      </Secao>

      <Secao legenda="Juros, multa e desconto (opcionais)">
        <Linha cols={3}>
          <Campo label="Juros">
            <input className="lux-input" type="number" step="0.01" min="0" inputMode="decimal"
              value={juros} onChange={e => setJuros(e.target.value)} placeholder="0,00" />
          </Campo>
          <Campo label="Multa">
            <input className="lux-input" type="number" step="0.01" min="0" inputMode="decimal"
              value={multa} onChange={e => setMulta(e.target.value)} placeholder="0,00" />
          </Campo>
          <Campo label="Desconto">
            <input className="lux-input" type="number" step="0.01" min="0" inputMode="decimal"
              value={desconto} onChange={e => setDesconto(e.target.value)} placeholder="0,00" />
          </Campo>
        </Linha>
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 14px", borderRadius: 8,
            background: mix(liquido > 0 ? C.green : C.red, 9),
            border: `1px solid ${mix(liquido > 0 ? C.green : C.red, 28)}`,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 500, color: C.muted }}>Valor líquido</span>
          <span style={{
            fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
            fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums",
            color: liquido > 0 ? C.green : C.red,
          }}>
            {fmtBRL(liquido)}
          </span>
        </div>
      </Secao>

      <Secao legenda="Classificação">
        {ehPagar ? (
          <Linha cols={2}>
            <Campo label={entidadeLabel} hint="Vínculo opcional">
              <select className="lux-select" aria-label={entidadeLabel} value={entidadeId} onChange={e => setEntidadeId(e.target.value)}>
                <option value="">— Sem vínculo —</option>
                {entidades.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </Campo>
            <Campo label="Categoria" obrigatorio hint="Plano de contas (Despesas)">
              <select className="lux-select" aria-label="Categoria" value={planoContaId} onChange={e => setPlanoContaId(e.target.value)}>
                <option value="">— Selecione —</option>
                {categorias.map(c => (
                  <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>
                ))}
              </select>
            </Campo>
          </Linha>
        ) : (
          <Linha cols={1}>
            <Campo label={entidadeLabel} hint="Vínculo opcional">
              <select className="lux-select" aria-label={entidadeLabel} value={entidadeId} onChange={e => setEntidadeId(e.target.value)}>
                <option value="">— Sem vínculo —</option>
                {entidades.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </Campo>
          </Linha>
        )}
      </Secao>

      {!editar && (
        <Secao legenda="Recorrência">
          <div
            style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4,
              padding: 4, borderRadius: 8,
              background: mix(C.muted, 10),
              border: `1px solid ${C.border}`,
            }}
            role="radiogroup" aria-label="Recorrência"
          >
            {(["NENHUMA", "PARCELADA", "RECORRENTE"] as TipoRecorrencia[]).map(t => {
              const on = tipoRecorrencia === t;
              return (
                <button
                  key={t} type="button"
                  onClick={() => setTipoRecorrencia(t)}
                  aria-pressed={on ? "true" : "false"}
                  style={{
                    height: 34, borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    transition: "all .16s ease",
                    background: on ? mix(C.accent, 16) : "transparent",
                    color: on ? C.accent : C.muted,
                    border: `1px solid ${on ? mix(C.accent, 45) : "transparent"}`,
                  }}
                >
                  {t === "NENHUMA" ? "Nenhuma" : t === "PARCELADA" ? "Parcelada" : "Recorrente"}
                </button>
              );
            })}
          </div>

          {usaEntrada && (
            <Linha cols={2}>
              <Campo label="Entrada à vista" hint="Opcional">
                <input className="lux-input" type="number" step="0.01" min="0" inputMode="decimal"
                  value={entrada} onChange={e => setEntrada(e.target.value)} placeholder="0,00" />
              </Campo>
              <Campo label="Forma da entrada">
                <select className="lux-select" aria-label="Forma da entrada" value={entradaForma} onChange={e => setEntradaForma(e.target.value)}
                  disabled={parseNum(entrada) <= 0}>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="PIX">PIX</option>
                  <option value="CARTAO_DEBITO">Cartão de débito</option>
                  <option value="CARTAO_CREDITO">Cartão de crédito</option>
                  <option value="BOLETO">Boleto</option>
                </select>
              </Campo>
            </Linha>
          )}

          {tipoRecorrencia !== "NENHUMA" && (
            <Linha style={{ gridTemplateColumns: "1fr 1fr", alignItems: "end" }}>
              <Campo label={tipoRecorrencia === "PARCELADA" ? "Nº de parcelas" : "Repetir por (meses)"}>
                <input className="lux-input" type="number" min="2" max="60"
                  value={parcelaTotal} onChange={e => setParcelaTotal(e.target.value)} />
              </Campo>
              <div style={{
                height: 36, padding: "0 12px", borderRadius: 8,
                border: `1px solid ${C.border}`, background: mix(C.accent, 7),
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 11, color: C.muted }}>
                  {tipoRecorrencia === "PARCELADA" ? "Cada parcela" : "Cada mês"}
                </span>
                <span style={{
                  fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
                  fontSize: 13, fontWeight: 600, color: C.accent, fontVariantNumeric: "tabular-nums",
                }}>
                  {valorParcela != null ? fmtBRL(valorParcela) : "—"}
                </span>
              </div>
            </Linha>
          )}

          {usaEntrada && parseNum(entrada) > 0 && (
            <p style={{ fontSize: 11, color: C.accent, margin: "2px 2px 0" }}>
              Entrada de {fmtBRL(parseNum(entrada))} ({ehPagar ? "registrada como paga" : "já recebida"}) + {parcelaTotal}× de{" "}
              {valorParcela != null ? fmtBRL(valorParcela) : "—"} = {fmtBRL(restanteParcelar)} parcelados.
            </p>
          )}
          {tipoRecorrencia === "PARCELADA" && (
            <p style={{ fontSize: 11, color: C.muted, margin: "2px 2px 0" }}>
              {usaEntrada && parseNum(entrada) > 0
                ? "A entrada é lançada no caixa aberto, se houver. Juros, multa e desconto se aplicam só à 1ª parcela."
                : "Juros, multa e desconto se aplicam apenas à 1ª parcela."}
            </p>
          )}
          {tipoRecorrencia === "RECORRENTE" && (
            <p style={{ fontSize: 11, color: C.muted, margin: "2px 2px 0" }}>
              Cria N contas com o mesmo valor, vencendo em meses subsequentes.
            </p>
          )}
        </Secao>
      )}

      <Secao legenda="Observações">
        <Linha cols={1}>
          <Campo label="Notas internas">
            <textarea className="lux-textarea" value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              placeholder="Detalhes, número do documento, condições…" />
          </Campo>
        </Linha>
      </Secao>
    </FormularioLuxuoso>
  );
}
