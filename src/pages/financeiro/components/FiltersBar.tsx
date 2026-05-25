import Icon from "./icons";

interface EntidadeOption {
  id: string;
  nome: string;
}

interface FiltersBarProps {
  search: string;
  onSearch?: (v: string) => void;
  entidadeId?: string;
  onEntidade?: (id: string) => void;
  entidades?: EntidadeOption[];
  entidadeLabel?: string;
  onLimpar?: () => void;
  kpiAtivo?: string;
  kpiLabel?: string;
}

export default function FiltersBar({
  search, onSearch,
  entidadeId, onEntidade,
  entidades = [],
  entidadeLabel = "fornecedores",
  onLimpar,
  kpiAtivo,
  kpiLabel,
}: FiltersBarProps) {
  const temFiltro = !!(search || entidadeId || kpiAtivo);

  return (
    <div className="grid gap-2.5 mb-[18px] items-center grid-cols-1 lg:grid-cols-[1.6fr_1fr_auto_auto]">
      <label className="flex items-center gap-2.5 h-10 px-3 border border-hairline-soft rounded-[10px] bg-white/[.02] text-fg-soft text-[13px] focus-within:border-iris focus-within:bg-white/[.035]">
        <span className="text-fg-faint inline-flex"><Icon name="search" /></span>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch?.(e.target.value)}
          placeholder="Buscar por descrição, fornecedor, código…"
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-fg placeholder:text-fg-faint font-sans text-[13px]"
        />
      </label>

      <label className="flex items-center gap-2.5 h-10 px-3 border border-hairline-soft rounded-[10px] bg-white/[.02] text-fg-soft text-[13px] cursor-pointer">
        <span className="text-fg-faint inline-flex"><Icon name="bag" /></span>
        <select
          value={entidadeId || ""}
          onChange={(e) => onEntidade?.(e.target.value)}
          className="flex-1 bg-transparent border-0 outline-none text-fg-soft text-[13px] cursor-pointer"
          style={{ appearance: "none" }}
        >
          <option value="">Todos os {entidadeLabel}</option>
          {entidades.map((e) => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
        <span className="text-fg-faint font-mono text-[11px]">{entidades.length} ativos</span>
        <span className="text-fg-faint inline-flex"><Icon name="chev" /></span>
      </label>

      {kpiAtivo && kpiLabel ? (
        <span className="inline-flex items-center gap-2 h-10 px-3 rounded-[10px] bg-iris/15 border border-iris/40 text-iris text-[12.5px] font-medium">
          Filtrado por {kpiLabel}
        </span>
      ) : (
        <span className="text-fg-faint text-[11.5px] italic px-1 hidden lg:inline">
          Use os indicadores acima para filtrar
        </span>
      )}

      {temFiltro ? (
        <button
          type="button"
          onClick={onLimpar}
          className="h-10 px-3 inline-flex items-center gap-2 rounded-[9px] border border-hairline bg-white/[.025] hover:bg-white/[.05] text-fg-soft hover:text-fg text-[12.5px] font-medium transition"
        >
          Limpar filtros
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
