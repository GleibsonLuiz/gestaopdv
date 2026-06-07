import { useEffect, useMemo, useState } from "react";
import ModalShell, {
  Alerta, BtnPrimario, BtnSecundario, Campo, Input, Select, Textarea,
} from "./ModalShell";
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

  return (
    <ModalShell
      titulo={editar ? "Editar conta" : `Nova conta ${ehPagar ? "a pagar" : "a receber"}`}
      subtitulo={ehPagar ? "Despesa · pagamento" : "Receita · recebimento"}
      largura={600}
      bloquearEsc={salvando}
      onFechar={onCancelar}
    >
      <form onSubmit={salvar}>
        <Campo label="Descrição *">
          <Input
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            required autoFocus
            placeholder="Ex: Aluguel, Energia, NF #123…"
          />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Valor bruto *">
            <Input type="number" step="0.01" min="0.01" value={valorBruto}
              onChange={e => setValorBruto(e.target.value)} required placeholder="0,00" />
          </Campo>
          <Campo label="Vencimento *">
            <Input type="date" value={vencimento}
              onChange={e => setVencimento(e.target.value)} required />
          </Campo>
        </div>

        <div className="bg-white/[.025] border border-hairline-soft rounded-[10px] p-3.5 mb-4">
          <div className="text-[10.5px] uppercase tracking-[.12em] text-fg-muted font-medium mb-2.5">
            Juros, multa e desconto (opcionais)
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <Campo label="Juros">
              <Input type="number" step="0.01" min="0" value={juros}
                onChange={e => setJuros(e.target.value)} placeholder="0,00" />
            </Campo>
            <Campo label="Multa">
              <Input type="number" step="0.01" min="0" value={multa}
                onChange={e => setMulta(e.target.value)} placeholder="0,00" />
            </Campo>
            <Campo label="Desconto">
              <Input type="number" step="0.01" min="0" value={desconto}
                onChange={e => setDesconto(e.target.value)} placeholder="0,00" />
            </Campo>
          </div>
          <div className="flex items-center justify-between px-3 py-2 rounded-[8px] bg-black/[.18] border border-hairline-soft">
            <span className="text-[11.5px] font-medium text-fg-muted">Valor líquido</span>
            <span className={`font-mono text-[15px] font-semibold tnum ${liquido > 0 ? "text-emerald2" : "text-coral"}`}>
              {fmtBRL(liquido)}
            </span>
          </div>
        </div>

        {ehPagar ? (
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Fornecedor">
              <Select value={entidadeId} onChange={e => setEntidadeId(e.target.value)}>
                <option value="">— Sem vínculo —</option>
                {entidades.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </Select>
            </Campo>
            <Campo label="Categoria *">
              <Select value={planoContaId} onChange={e => setPlanoContaId(e.target.value)} required>
                <option value="">— Selecione —</option>
                {categorias.map(c => (
                  <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>
                ))}
              </Select>
            </Campo>
          </div>
        ) : (
          <Campo label="Cliente">
            <Select value={entidadeId} onChange={e => setEntidadeId(e.target.value)}>
              <option value="">— Sem vínculo —</option>
              {entidades.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </Select>
          </Campo>
        )}

        {!editar && (
          <div className="bg-white/[.025] border border-hairline-soft rounded-[10px] p-3.5 mb-4">
            <div className="text-[10.5px] uppercase tracking-[.12em] text-fg-muted font-medium mb-2.5">
              Recorrência
            </div>
            <div className="grid grid-cols-3 gap-1 p-1 bg-black/[.18] border border-hairline-soft rounded-[8px] mb-3">
              {(["NENHUMA", "PARCELADA", "RECORRENTE"] as TipoRecorrencia[]).map(t => (
                <button
                  key={t} type="button"
                  onClick={() => setTipoRecorrencia(t)}
                  className={[
                    "h-9 rounded-[6px] text-[12px] font-medium transition",
                    tipoRecorrencia === t
                      ? "bg-iris/20 text-iris border border-iris/40"
                      : "text-fg-muted hover:text-fg-soft",
                  ].join(" ")}
                >
                  {t === "NENHUMA" ? "Nenhuma" : t === "PARCELADA" ? "Parcelada" : "Recorrente"}
                </button>
              ))}
            </div>
            {usaEntrada && (
              <div className="grid grid-cols-2 gap-2.5">
                <Campo label="Entrada à vista (opcional)">
                  <Input type="number" step="0.01" min="0" value={entrada}
                    onChange={e => setEntrada(e.target.value)} placeholder="0,00" />
                </Campo>
                <Campo label="Forma da entrada">
                  <Select value={entradaForma} onChange={e => setEntradaForma(e.target.value)}
                    disabled={parseNum(entrada) <= 0}>
                    <option value="DINHEIRO">Dinheiro</option>
                    <option value="PIX">PIX</option>
                    <option value="CARTAO_DEBITO">Cartão de débito</option>
                    <option value="CARTAO_CREDITO">Cartão de crédito</option>
                    <option value="BOLETO">Boleto</option>
                  </Select>
                </Campo>
              </div>
            )}
            {tipoRecorrencia !== "NENHUMA" && (
              <div className="grid grid-cols-2 gap-2.5 items-end">
                <Campo label={tipoRecorrencia === "PARCELADA" ? "Nº de parcelas" : "Repetir por (meses)"}>
                  <Input type="number" min="2" max="60" value={parcelaTotal}
                    onChange={e => setParcelaTotal(e.target.value)} />
                </Campo>
                <div className="h-10 px-3 rounded-[9px] border border-hairline-soft bg-black/[.15] flex items-center justify-between mb-3.5">
                  <span className="text-[11px] text-fg-faint">
                    {tipoRecorrencia === "PARCELADA" ? "Cada parcela" : "Cada mês"}
                  </span>
                  <span className="font-mono text-[13px] font-semibold text-iris tnum">
                    {valorParcela != null ? fmtBRL(valorParcela) : "—"}
                  </span>
                </div>
              </div>
            )}
            {usaEntrada && parseNum(entrada) > 0 && (
              <p className="text-[11px] text-iris mt-1">
                Entrada de {fmtBRL(parseNum(entrada))} ({ehPagar ? "registrada como paga" : "já recebida"}) + {parcelaTotal}× de{" "}
                {valorParcela != null ? fmtBRL(valorParcela) : "—"} ={" "}
                {fmtBRL(restanteParcelar)} parcelados.
              </p>
            )}
            {tipoRecorrencia === "PARCELADA" && (
              <p className="text-[11px] text-fg-faint mt-1">
                {usaEntrada && parseNum(entrada) > 0
                  ? `A entrada é lançada no caixa aberto, se houver. Juros, multa e desconto se aplicam só à 1ª parcela.`
                  : "Juros, multa e desconto se aplicam apenas à 1ª parcela."}
              </p>
            )}
            {tipoRecorrencia === "RECORRENTE" && (
              <p className="text-[11px] text-fg-faint mt-1">
                Cria N contas com o mesmo valor, vencendo em meses subsequentes.
              </p>
            )}
          </div>
        )}

        <Campo label="Observações">
          <Textarea rows={3} value={observacoes} onChange={e => setObservacoes(e.target.value)} />
        </Campo>

        {erro && <Alerta>{erro}</Alerta>}

        <div className="flex justify-end gap-2.5 mt-5 pt-4 border-t border-hairline-soft">
          <BtnSecundario type="button" disabled={salvando} onClick={onCancelar}>
            Cancelar
          </BtnSecundario>
          <BtnPrimario type="submit" disabled={salvando}>
            {salvando ? "Salvando…" : (editar ? "Salvar alterações" : "Criar conta")}
          </BtnPrimario>
        </div>
      </form>
    </ModalShell>
  );
}
