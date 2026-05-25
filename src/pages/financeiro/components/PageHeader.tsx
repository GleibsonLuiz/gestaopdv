interface PageHeaderProps {
  subtitulo?: string;
}

export default function PageHeader({ subtitulo }: PageHeaderProps) {
  return (
    <div className="pt-3 pb-5">
      <h1 className="m-0 text-[22px] leading-[1.15] font-semibold tracking-[-0.02em] text-fg">
        Financeiro
      </h1>
      <p className="m-0 mt-1 text-[13px] text-fg-muted">
        {subtitulo ?? "Contas a pagar e a receber, com fluxo de caixa e conciliação."}
      </p>
    </div>
  );
}
