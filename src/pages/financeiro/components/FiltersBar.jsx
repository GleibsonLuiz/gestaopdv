import Icon from './icons';

const STATUS = [
  { id: '',          label: 'Todos',      color: 'var(--fg)' },
  { id: 'PENDENTE',  label: 'Pendentes',  color: 'var(--amber)' },
  { id: 'ATRASADA',  label: 'Atrasadas',  color: 'var(--coral)' },
  { id: 'PAGA',      label: 'Pagas',      color: 'var(--emerald)' },
];

export default function FiltersBar({
  search, onSearch,
  status, onStatus,
  entidadeId, onEntidade,
  vencidas, onVencidas,
  entidades = [],
  entidadeLabel = 'fornecedores',
  onLimpar,
}) {
  const temFiltro = !!(search || status || entidadeId || vencidas);

  return (
    <div className="grid gap-2.5 mb-[18px] items-center grid-cols-1 lg:grid-cols-[1.4fr_.8fr_.8fr_auto_auto]">
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

      <div className="inline-flex items-stretch border border-hairline-soft rounded-[10px] bg-white/[.02] h-10 p-1 gap-0.5">
        {STATUS.map(s => {
          const on = s.id === (status || '');
          return (
            <button
              key={s.id || 'todos'}
              onClick={() => onStatus?.(s.id)}
              className={[
                'px-3 rounded-[7px] text-[12.5px] font-medium inline-flex items-center gap-1.5 transition',
                on ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:text-fg-soft',
              ].join(' ')}
              style={!on ? { color: s.color } : undefined}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: on ? 'var(--fg-faint)' : s.color }}
              />
              {s.label}
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-2.5 h-10 px-3 border border-hairline-soft rounded-[10px] bg-white/[.02] text-fg-soft text-[13px] cursor-pointer">
        <span className="text-fg-faint inline-flex"><Icon name="bag" /></span>
        <select
          value={entidadeId || ''}
          onChange={(e) => onEntidade?.(e.target.value)}
          className="flex-1 bg-transparent border-0 outline-none text-fg-soft text-[13px] cursor-pointer"
          style={{ appearance: 'none' }}
        >
          <option value="">Todos os {entidadeLabel}</option>
          {entidades.map(e => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
        <span className="text-fg-faint font-mono text-[11px]">{entidades.length} ativos</span>
        <span className="text-fg-faint inline-flex"><Icon name="chev" /></span>
      </label>

      <button
        onClick={() => onVencidas?.(!vencidas)}
        className="inline-flex items-center gap-2 text-fg-muted text-[12.5px] px-2"
      >
        <span
          className={[
            'relative w-[30px] h-[18px] rounded-full transition border',
            vencidas ? 'border-iris' : 'border-hairline',
          ].join(' ')}
          style={{
            background: vencidas ? 'oklch(0.74 0.13 286 / .35)' : 'oklch(1 0 0 / .08)',
          }}
        >
          <span
            className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
            style={{
              left: vencidas ? '14px' : '2px',
              background: vencidas ? 'var(--iris)' : 'var(--fg-faint)',
            }}
          />
        </span>
        Apenas vencidas
      </button>

      {temFiltro ? (
        <button
          onClick={onLimpar}
          className="h-10 px-3 inline-flex items-center gap-2 rounded-[9px] border border-hairline bg-white/[.025] hover:bg-white/[.05] text-fg-soft hover:text-fg text-[12.5px] font-medium transition"
        >
          Limpar
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
