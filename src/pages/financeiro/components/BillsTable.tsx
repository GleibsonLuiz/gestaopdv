import type { ReactNode } from "react";
import StatusPill from "./StatusPill";
import DueCell from "./DueCell";
import AmountCell from "./AmountCell";
import ActionsMenu from "../../../components/ActionsMenu";

type SupplierTone = "c1" | "c2" | "c3" | "c4" | "c5";

const SUPPLIER_TONES: Record<SupplierTone, string> = {
  c1: "linear-gradient(135deg, oklch(0.45 0.10 200), oklch(0.30 0.06 240))",
  c2: "linear-gradient(135deg, oklch(0.42 0.10 286), oklch(0.30 0.06 286))",
  c3: "linear-gradient(135deg, oklch(0.42 0.10 78),  oklch(0.30 0.06 60))",
  c4: "linear-gradient(135deg, oklch(0.42 0.10 158), oklch(0.30 0.06 158))",
  c5: "linear-gradient(135deg, oklch(0.42 0.10 22),  oklch(0.30 0.06 22))",
};

type DueState = "late" | "today" | "soon" | "paid";

export interface Bill {
  id: string;
  ref: string;
  sub?: string;
  parcela?: string;
  supplier?: string;
  supplierShort?: string;
  supplierTone?: SupplierTone | string;
  dueDate: string;
  dueRel: string;
  dueState: DueState;
  amount: string;
  cents: string;
  status: string;
  attachments?: number;
}

interface BillsTableProps {
  bills: Bill[];
  ehPagar?: boolean;
  podeEditar?: boolean;
  carregando?: boolean;
  erro?: string;
  totalFiltrado?: string | number | null;
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
  onPay,
  onEdit,
  onAttach,
  onReabrir,
  onCancelar,
}: BillsTableProps) {
  const labelEntidade = ehPagar ? "Fornecedor" : "Cliente";
  const tituloLista = ehPagar ? "Contas a pagar" : "Contas a receber";

  return (
    <div className="bg-surface border border-hairline-soft rounded-card shadow-card overflow-hidden">
      <div className="flex items-center justify-between p-[14px_18px] border-b border-hairline-soft">
        <div className="flex items-center gap-2.5 text-fg-soft text-[13px] font-medium">
          {tituloLista}
          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-full bg-white/[.04] text-fg-muted border border-hairline-soft tnum">
            {bills.length}
          </span>
          <span className="text-fg-faint font-normal text-[12.5px]">· ordenado por vencimento</span>
        </div>
      </div>

      {erro && (
        <div className="p-[14px_18px] text-coral text-[12.5px] border-b border-hairline-soft">
          {erro}
        </div>
      )}

      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-black/[.12]">
            <Th first>Descrição</Th>
            <Th>{labelEntidade}</Th>
            <Th>Vencimento</Th>
            <Th align="right">Valor</Th>
            <Th>Status</Th>
            <Th align="right" last>Ações</Th>
          </tr>
        </thead>
        <tbody>
          {carregando ? (
            <tr>
              <td colSpan={6} className="p-[30px] text-center text-fg-muted text-[13px]">
                Carregando…
              </td>
            </tr>
          ) : bills.length === 0 ? (
            <tr>
              <td colSpan={6} className="p-[30px] text-center text-fg-muted text-[13px]">
                Nenhuma conta encontrada.
              </td>
            </tr>
          ) : bills.map((bill) => (
            <BillRow
              key={bill.id}
              bill={bill}
              ehPagar={ehPagar}
              podeEditar={podeEditar}
              onPay={onPay}
              onEdit={onEdit}
              onAttach={onAttach}
              onReabrir={onReabrir}
              onCancelar={onCancelar}
            />
          ))}
        </tbody>
      </table>

      {totalFiltrado != null && (
        <div className="flex items-center justify-between p-[14px_18px] border-t border-hairline-soft text-fg-muted text-[12.5px]">
          <div className="flex items-center gap-[22px] font-mono text-xs tnum">
            <div>Total filtrado <b className="text-fg font-medium">{totalFiltrado}</b></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  align = "left",
  first,
  last,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  first?: boolean;
  last?: boolean;
}) {
  return (
    <th
      className="text-left p-[10px_18px] font-medium text-[10.5px] uppercase tracking-[.14em] text-fg-faint border-y border-hairline-soft whitespace-nowrap"
      style={{
        textAlign: align,
        paddingLeft: first ? 18 : undefined,
        paddingRight: last ? 18 : undefined,
      }}
    >
      {children}
    </th>
  );
}

interface BillRowProps {
  bill: Bill;
  ehPagar: boolean;
  podeEditar: boolean;
  onPay?: (b: Bill) => void;
  onEdit?: (b: Bill) => void;
  onAttach?: (b: Bill) => void;
  onReabrir?: (b: Bill) => void;
  onCancelar?: (b: Bill) => void;
}

function BillRow({ bill, ehPagar, podeEditar, onPay, onEdit, onAttach, onReabrir, onCancelar }: BillRowProps) {
  const isPaid = bill.status === "paid";
  const isCanceled = bill.status === "canceled";
  const isFinal = isPaid || isCanceled;

  return (
    <tr
      className={[
        "group border-b border-hairline-soft last:border-b-0 transition",
        isFinal ? "opacity-70" : "",
        "hover:bg-white/[.025]",
      ].join(" ")}
    >
      <td className="p-[16px_18px] align-middle text-fg font-medium min-w-[280px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span>{bill.ref}</span>
          {bill.parcela && (
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-iris/10 text-iris border border-iris/30">
              {bill.parcela}
            </span>
          )}
        </div>
        {bill.sub && (
          <span className="block text-[11.5px] text-fg-faint font-normal mt-0.5">{bill.sub}</span>
        )}
      </td>

      <td className="p-[16px_18px] align-middle text-fg-soft max-w-[320px]">
        <div className="flex items-center gap-2.5">
          <span
            className="w-[26px] h-[26px] rounded-[7px] inline-flex items-center justify-center font-semibold text-[10.5px] border border-hairline-soft flex-none"
            style={{
              background: SUPPLIER_TONES[bill.supplierTone as SupplierTone] || SUPPLIER_TONES.c1,
              color: "oklch(0.95 0.04 240)",
            }}
          >
            {bill.supplierShort}
          </span>
          <span>{bill.supplier || <span className="text-fg-faint">—</span>}</span>
        </div>
      </td>

      <td className="p-[16px_18px] align-middle">
        <DueCell date={bill.dueDate} rel={bill.dueRel} state={bill.dueState} />
      </td>

      <td className="p-[16px_18px] align-middle text-right">
        <AmountCell value={bill.amount} cents={bill.cents} dim={isFinal} />
      </td>

      <td className="p-[16px_18px] align-middle">
        <StatusPill status={bill.status} />
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
