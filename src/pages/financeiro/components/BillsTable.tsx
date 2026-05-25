import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import StatusPill from "./StatusPill";
import DueCell from "./DueCell";
import AmountCell from "./AmountCell";
import ActionsMenu from "../../../components/ActionsMenu";

type DueState = "late" | "today" | "soon" | "paid";
export type BillBucket = "atrasadas" | "hoje" | "semana" | "mes" | "futuras" | "concluidas";

export interface Bill {
  id: string;
  ref: string;
  sub?: string;
  parcela?: string;
  supplier?: string;
  supplierShort?: string;
  supplierTone?: string;
  dueDate: string;
  dueRel: string;
  dueState: DueState;
  amount: string;
  cents: string;
  amountNum: number;
  status: string;
  attachments?: number;
  bucket: BillBucket;
}

interface BucketMeta {
  id: BillBucket;
  label: string;
  icon: string;
  tone: string;
}

const BUCKET_META: BucketMeta[] = [
  { id: "atrasadas",   label: "Vencidas",        icon: "▾", tone: "text-coral" },
  { id: "hoje",        label: "Vence hoje",      icon: "●", tone: "text-amber2" },
  { id: "semana",      label: "Esta semana",     icon: "◗", tone: "text-amber2" },
  { id: "mes",         label: "Próximas 30 dias",icon: "◐", tone: "text-iris" },
  { id: "futuras",     label: "Futuras",         icon: "◌", tone: "text-fg-muted" },
  { id: "concluidas",  label: "Concluídas",      icon: "✓", tone: "text-emerald2" },
];

function fmtBRL(n: number): string {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface BillsTableProps {
  bills: Bill[];
  ehPagar?: boolean;
  podeEditar?: boolean;
  carregando?: boolean;
  erro?: string;
  totalFiltrado?: string | number | null;
  selecionadas?: Set<string>;
  onSelecionarTodas?: (ids: string[]) => void;
  onToggleSelecionada?: (id: string) => void;
  onPay?: (b: Bill) => void;
  onEdit?: (b: Bill) => void;
  onAttach?: (b: Bill) => void;
  onReabrir?: (b: Bill) => void;
  onCancelar?: (b: Bill) => void;
}

export default function BillsTable({
  bills,
  ehPagar = true,
  podeEditar = true,
  carregando = false,
  erro = "",
  totalFiltrado,
  selecionadas,
  onSelecionarTodas,
  onToggleSelecionada,
  onPay,
  onEdit,
  onAttach,
  onReabrir,
  onCancelar,
}: BillsTableProps) {
  const labelEntidade = ehPagar ? "Fornecedor" : "Cliente";
  const tituloLista = ehPagar ? "Contas a pagar" : "Contas a receber";
  const paidLabel = ehPagar ? "Paga" : "Recebida";
  const temSelecao = !!(selecionadas && onToggleSelecionada);

  const grupos = useMemo(() => {
    const m = new Map<BillBucket, Bill[]>();
    for (const b of bills) {
      const arr = m.get(b.bucket) || [];
      arr.push(b);
      m.set(b.bucket, arr);
    }
    return BUCKET_META
      .map(meta => ({
        meta,
        bills: m.get(meta.id) || [],
        total: (m.get(meta.id) || []).reduce((acc, b) => acc + b.amountNum, 0),
      }))
      .filter(g => g.bills.length > 0);
  }, [bills]);

  return (
    <div className="bg-surface border border-hairline-soft rounded-card shadow-card overflow-hidden">
      <div className="flex items-center justify-between p-[14px_18px] border-b border-hairline-soft">
        <div className="flex items-center gap-2.5 text-fg-soft text-[13px] font-medium">
          {tituloLista}
          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-full bg-white/[.04] text-fg-muted border border-hairline-soft tnum">
            {bills.length}
          </span>
          <span className="text-fg-faint font-normal text-[12.5px]">· agrupado por vencimento</span>
        </div>
        {totalFiltrado != null && (
          <div className="flex items-center gap-1.5 text-fg-muted text-[12px] font-mono tnum">
            <span className="text-fg-faint">Total</span>
            <span className="text-fg-soft font-medium">{totalFiltrado}</span>
          </div>
        )}
      </div>

      {erro && (
        <div className="p-[14px_18px] text-coral text-[12.5px] border-b border-hairline-soft">
          {erro}
        </div>
      )}

      {carregando ? (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-black/[.12]">
              {temSelecao && <Th first style={{ width: 36 }}>&nbsp;</Th>}
              <Th first={!temSelecao}>Descrição</Th>
              <Th>{labelEntidade}</Th>
              <Th>Vencimento</Th>
              <Th align="right">Valor</Th>
              <Th>Status</Th>
              <Th align="right" last>Ações</Th>
            </tr>
          </thead>
          <tbody><SkeletonRows temSelecao={temSelecao} /></tbody>
        </table>
      ) : bills.length === 0 ? (
        <div className="p-[40px] text-center">
          <div className="text-fg-muted text-[13px] font-medium">Nenhuma conta encontrada.</div>
          <div className="text-fg-faint text-[12px] mt-1">Ajuste os filtros ou crie uma nova conta.</div>
        </div>
      ) : grupos.map(g => (
        <BucketSection
          key={g.meta.id}
          meta={g.meta}
          bills={g.bills}
          total={g.total}
          ehPagar={ehPagar}
          podeEditar={podeEditar}
          paidLabel={paidLabel}
          labelEntidade={labelEntidade}
          selecionadas={selecionadas}
          onSelecionarTodas={onSelecionarTodas}
          onToggleSelecionada={onToggleSelecionada}
          onPay={onPay}
          onEdit={onEdit}
          onAttach={onAttach}
          onReabrir={onReabrir}
          onCancelar={onCancelar}
        />
      ))}
    </div>
  );
}

interface BucketSectionProps {
  meta: BucketMeta;
  bills: Bill[];
  total: number;
  ehPagar: boolean;
  podeEditar: boolean;
  paidLabel: string;
  labelEntidade: string;
  selecionadas?: Set<string>;
  onSelecionarTodas?: (ids: string[]) => void;
  onToggleSelecionada?: (id: string) => void;
  onPay?: (b: Bill) => void;
  onEdit?: (b: Bill) => void;
  onAttach?: (b: Bill) => void;
  onReabrir?: (b: Bill) => void;
  onCancelar?: (b: Bill) => void;
}

function BucketSection({
  meta, bills, total, ehPagar, podeEditar, paidLabel, labelEntidade,
  selecionadas, onSelecionarTodas, onToggleSelecionada,
  onPay, onEdit, onAttach, onReabrir, onCancelar,
}: BucketSectionProps) {
  const [colapsado, setColapsado] = useState<boolean>(meta.id === "concluidas");
  const temSelecao = !!(selecionadas && onToggleSelecionada);
  const idsSelecionaveis = bills
    .filter(b => b.status !== "paid" && b.status !== "canceled")
    .map(b => b.id);
  const algumaSelecionada = !!selecionadas && idsSelecionaveis.some(id => selecionadas.has(id));
  const todasSelecionadas =
    !!selecionadas && idsSelecionaveis.length > 0 && idsSelecionaveis.every(id => selecionadas!.has(id));

  function toggleGrupo() {
    if (!onSelecionarTodas) return;
    if (todasSelecionadas) {
      onSelecionarTodas(bills.filter(b => selecionadas?.has(b.id)).map(b => b.id));
    } else {
      onSelecionarTodas(idsSelecionaveis);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setColapsado(c => !c)}
        className="w-full flex items-center justify-between gap-3 px-[18px] py-[10px] border-y border-hairline-soft bg-black/[.10] hover:bg-black/[.18] transition text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`font-mono text-[11px] ${meta.tone}`}>{meta.icon}</span>
          <span className="text-[11.5px] uppercase tracking-[.12em] text-fg-soft font-medium">{meta.label}</span>
          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-full bg-white/[.04] text-fg-muted border border-hairline-soft tnum">
            {bills.length}
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[12px] tnum">
          <span className="text-fg-muted">{fmtBRL(total)}</span>
          <span className="text-fg-faint text-[10px]">{colapsado ? "▸" : "▾"}</span>
        </div>
      </button>

      {!colapsado && (
        <table className="w-full border-collapse text-[13px]">
          <thead className="sr-only">
            <tr>
              {temSelecao && <th>Selecionar</th>}
              <th>Descrição</th>
              <th>{labelEntidade}</th>
              <th>Vencimento</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {temSelecao && idsSelecionaveis.length > 1 && (
              <tr className="bg-black/[.05] border-b border-hairline-soft">
                <td className="p-[6px_18px] w-9">
                  <Checkbox
                    checked={todasSelecionadas}
                    indeterminate={!todasSelecionadas && algumaSelecionada}
                    onChange={toggleGrupo}
                  />
                </td>
                <td colSpan={6} className="p-[6px_8px] text-[11px] text-fg-faint">
                  {todasSelecionadas ? "Todas marcadas" : `Selecionar ${idsSelecionaveis.length} contas deste grupo`}
                </td>
              </tr>
            )}
            {bills.map(bill => (
              <BillRow
                key={bill.id}
                bill={bill}
                ehPagar={ehPagar}
                podeEditar={podeEditar}
                paidLabel={paidLabel}
                selecionavel={temSelecao && idsSelecionaveis.includes(bill.id)}
                selecionada={!!selecionadas?.has(bill.id)}
                onToggleSelecionada={onToggleSelecionada}
                onPay={onPay}
                onEdit={onEdit}
                onAttach={onAttach}
                onReabrir={onReabrir}
                onCancelar={onCancelar}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface CheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  disabled?: boolean;
}

function Checkbox({ checked, indeterminate, onChange, disabled }: CheckboxProps) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      disabled={disabled}
      aria-checked={indeterminate ? "mixed" : checked}
      role="checkbox"
      className={[
        "w-[16px] h-[16px] rounded-[4px] border inline-flex items-center justify-center transition",
        checked || indeterminate
          ? "border-iris bg-iris/20 text-iris"
          : "border-hairline bg-white/[.02] hover:border-iris/60",
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      {checked && <span className="text-[10px] leading-none">✓</span>}
      {!checked && indeterminate && <span className="block w-[8px] h-[2px] bg-iris rounded-full" />}
    </button>
  );
}

function Th({
  children,
  align = "left",
  first,
  last,
  style,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  first?: boolean;
  last?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <th
      className="text-left p-[10px_18px] font-medium text-[10.5px] uppercase tracking-[.14em] text-fg-faint border-y border-hairline-soft whitespace-nowrap"
      style={{
        textAlign: align,
        paddingLeft: first ? 18 : undefined,
        paddingRight: last ? 18 : undefined,
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function SkeletonRows({ temSelecao }: { temSelecao?: boolean }) {
  return (
    <>
      {[0, 1, 2].map(i => (
        <tr key={i} className="border-b border-hairline-soft last:border-b-0">
          {temSelecao && <td className="p-[16px_18px] w-9" />}
          <td className="p-[16px_18px]"><Bone w="60%" /></td>
          <td className="p-[16px_18px]"><Bone w="70%" /></td>
          <td className="p-[16px_18px]"><Bone w="55%" /></td>
          <td className="p-[16px_18px]"><div className="flex justify-end"><Bone w="50%" /></div></td>
          <td className="p-[16px_18px]"><Bone w="50%" /></td>
          <td className="p-[16px_18px]"><div className="flex justify-end"><Bone w="30%" /></div></td>
        </tr>
      ))}
    </>
  );
}

function Bone({ w }: { w: string }) {
  return (
    <span
      className="block h-[10px] rounded-full bg-white/[.05] animate-pulse"
      style={{ width: w }}
    />
  );
}

interface BillRowProps {
  bill: Bill;
  ehPagar: boolean;
  podeEditar: boolean;
  paidLabel: string;
  selecionavel?: boolean;
  selecionada?: boolean;
  onToggleSelecionada?: (id: string) => void;
  onPay?: (b: Bill) => void;
  onEdit?: (b: Bill) => void;
  onAttach?: (b: Bill) => void;
  onReabrir?: (b: Bill) => void;
  onCancelar?: (b: Bill) => void;
}

function BillRow({
  bill, ehPagar, podeEditar, paidLabel,
  selecionavel, selecionada, onToggleSelecionada,
  onPay, onEdit, onAttach, onReabrir, onCancelar,
}: BillRowProps) {
  const isPaid = bill.status === "paid";
  const isCanceled = bill.status === "canceled";
  const isFinal = isPaid || isCanceled;

  return (
    <tr
      className={[
        "group border-b border-hairline-soft last:border-b-0 transition",
        isCanceled ? "opacity-55" : isPaid ? "opacity-80" : "",
        selecionada ? "bg-iris/[.06]" : "hover:bg-white/[.025]",
      ].join(" ")}
    >
      {(selecionavel || onToggleSelecionada) && (
        <td className="p-[16px_8px_16px_18px] w-9 align-middle">
          {selecionavel && (
            <Checkbox
              checked={!!selecionada}
              onChange={() => onToggleSelecionada?.(bill.id)}
            />
          )}
        </td>
      )}
      <td className="p-[16px_18px] align-middle text-fg font-medium min-w-[280px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span>{bill.ref}</span>
          {bill.parcela && (
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-iris/10 text-iris border border-iris/30">
              {bill.parcela}
            </span>
          )}
          {(bill.attachments ?? 0) > 0 && (
            <span
              className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/[.04] text-fg-muted border border-hairline-soft inline-flex items-center gap-1"
              title={`${bill.attachments} ${bill.attachments === 1 ? "anexo" : "anexos"}`}
            >
              📎 {bill.attachments}
            </span>
          )}
        </div>
        {bill.sub && (
          <span className="block text-[11.5px] text-fg-faint font-normal mt-0.5">{bill.sub}</span>
        )}
      </td>

      <td className="p-[16px_18px] align-middle text-fg-soft max-w-[320px]">
        <span className="text-[13px]">
          {bill.supplier || <span className="text-fg-faint">—</span>}
        </span>
      </td>

      <td className="p-[16px_18px] align-middle">
        <DueCell date={bill.dueDate} rel={bill.dueRel} state={bill.dueState} />
      </td>

      <td className="p-[16px_18px] align-middle text-right">
        <AmountCell value={bill.amount} cents={bill.cents} dim={isFinal} />
      </td>

      <td className="p-[16px_18px] align-middle">
        <StatusPill status={bill.status} paidLabel={paidLabel} />
      </td>

      <td className="p-[16px_18px] align-middle text-right whitespace-nowrap pr-[18px]">
        <ActionsMenu
          items={[
            {
              label: ehPagar ? "Pagar" : "Receber",
              icon: "✓",
              color: "oklch(0.78 0.15 158)",
              onClick: () => onPay?.(bill),
              hidden: isFinal || !podeEditar,
            },
            {
              label: (bill.attachments ?? 0) > 0 ? `Anexos (${bill.attachments})` : "Anexos",
              icon: "📎",
              onClick: () => onAttach?.(bill),
              hidden: !((bill.attachments ?? 0) > 0 || (podeEditar && !isCanceled)),
            },
            {
              label: "Editar",
              icon: "✎",
              onClick: () => onEdit?.(bill),
              hidden: isFinal || !podeEditar,
            },
            {
              label: "Reabrir",
              icon: "↺",
              color: "oklch(0.82 0.14 78)",
              onClick: () => onReabrir?.(bill),
              hidden: !(isPaid && podeEditar),
            },
            {
              label: "Cancelar",
              icon: "✕",
              color: "oklch(0.72 0.18 22)",
              onClick: () => onCancelar?.(bill),
              hidden: isFinal || !podeEditar,
            },
          ]}
        />
      </td>
    </tr>
  );
}
