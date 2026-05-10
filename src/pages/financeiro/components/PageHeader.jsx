const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default function PageHeader() {
  const hoje = new Date();
  const mesAno = `${MESES[hoje.getMonth()]} ${hoje.getFullYear()}`;

  return (
    <div className="pt-4 pb-4">
      <div className="flex items-center gap-2 text-[9.5px] uppercase tracking-[.16em] text-fg-faint mb-1.5">
        <span className="w-[12px] h-px bg-fg-dim" />
        Painel financeiro · {mesAno}
      </div>
      <h1 className="m-0 mb-1 text-[20px] leading-[1.15] font-semibold tracking-[-0.015em] text-fg">
        Contas <span className="font-serif italic text-fg-soft">a pagar</span> &amp; receber
      </h1>
      <p className="text-fg-muted text-[12px] max-w-[64ch] leading-[1.45] m-0">
        Acompanhe o fluxo de caixa do negócio em uma única superfície —
        quitação, vencimentos próximos e conciliação automática com fornecedores.
      </p>
    </div>
  );
}
