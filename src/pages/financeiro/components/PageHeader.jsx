const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default function PageHeader() {
  const hoje = new Date();
  const mesAno = `${MESES[hoje.getMonth()]} ${hoje.getFullYear()}`;

  return (
    <div className="grid grid-cols-[1fr_auto] gap-8 items-end pt-7 pb-6">
      <div>
        <div className="flex items-center gap-2.5 text-[11px] uppercase tracking-[.18em] text-fg-faint mb-3.5">
          <span className="w-[18px] h-px bg-fg-dim" />
          Painel financeiro · {mesAno}
        </div>
        <h1 className="m-0 mb-2.5 text-[44px] leading-[1.02] font-medium tracking-[-0.025em] text-fg">
          Contas <span className="font-serif italic text-fg-soft">a pagar</span> &amp; receber
        </h1>
        <p className="text-fg-muted text-sm max-w-[56ch] leading-[1.5] m-0">
          Acompanhe o fluxo de caixa do negócio em uma única superfície —
          quitação, vencimentos próximos e conciliação automática com fornecedores.
        </p>
      </div>
    </div>
  );
}
