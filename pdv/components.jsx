// Icons + small components shared across the PDV app.
// All exported to window so other Babel scripts can use them.

const Icon = ({ name, size = 16, stroke = 1.6 }) => {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: stroke,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (name) {
    case 'scan':
      return (<svg {...props}><path d="M4 7V5a1 1 0 0 1 1-1h2"/><path d="M20 7V5a1 1 0 0 0-1-1h-2"/><path d="M4 17v2a1 1 0 0 0 1 1h2"/><path d="M20 17v2a1 1 0 0 1-1 1h-2"/><path d="M4 12h16"/></svg>);
    case 'search':
      return (<svg {...props}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>);
    case 'cart':
      return (<svg {...props}><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6"/></svg>);
    case 'cart-empty':
      return (<svg {...props} strokeWidth="1.4"><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6"/></svg>);
    case 'plus':       return (<svg {...props}><path d="M12 5v14M5 12h14"/></svg>);
    case 'minus':      return (<svg {...props}><path d="M5 12h14"/></svg>);
    case 'x':          return (<svg {...props}><path d="M6 6l12 12M18 6l-12 12"/></svg>);
    case 'check':      return (<svg {...props}><path d="M5 12.5l4.5 4.5L19 7"/></svg>);
    case 'arrow-right':return (<svg {...props}><path d="M5 12h14M13 6l6 6-6 6"/></svg>);
    case 'history':    return (<svg {...props}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>);
    case 'sparkles':   return (<svg {...props}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M5.5 18.5l2-2M16.5 7.5l2-2"/></svg>);
    case 'flame':      return (<svg {...props}><path d="M12 22c4 0 7-2.7 7-7 0-3.3-2-5-3.5-7-1.5-2-1.5-4-1.5-5-2 1-4 3-4 6-1.5-1-2-2.5-2-4-2 2-3 4-3 7 0 4.3 3 10 7 10z"/></svg>);
    case 'doc':        return (<svg {...props}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>);
    case 'print':      return (<svg {...props}><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="9" rx="2"/><path d="M7 14h10v6H7z"/></svg>);
    case 'copy':       return (<svg {...props}><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>);
    case 'shield':     return (<svg {...props}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/></svg>);
    case 'book':       return (<svg {...props}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>);
    case 'bolt':       return (<svg {...props}><path d="M13 3 4 14h7l-1 7 9-11h-7l1-7z"/></svg>);
    case 'paper':      return (<svg {...props}><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>);
    case 'pen':        return (<svg {...props}><path d="M16 3l5 5-12 12-5 1 1-5z"/><path d="M14 5l5 5"/></svg>);
    case 'box':        return (<svg {...props}><path d="m21 8-9 4-9-4 9-4 9 4z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/></svg>);
    case 'cash':       return (<svg {...props}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5 9h.01M19 15h.01"/></svg>);
    case 'card':       return (<svg {...props}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>);
    case 'pix':        return (<svg {...props}><path d="m12 3 4 4-4 4-4-4z"/><path d="m12 13 4 4-4 4-4-4z"/><path d="m3 12 4-4 4 4-4 4z"/><path d="m13 12 4-4 4 4-4 4z"/></svg>);
    case 'wallet':     return (<svg {...props}><path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M16 13h2"/></svg>);
    case 'sun':        return (<svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg>);
    case 'moon':       return (<svg {...props}><path d="M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10z"/></svg>);
    case 'grid':       return (<svg {...props}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>);
    case 'list':       return (<svg {...props}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>);
    case 'user':       return (<svg {...props}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>);
    case 'tag':        return (<svg {...props}><path d="M20.6 13.4 12 22 2 12V2h10z"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/></svg>);
    case 'percent':    return (<svg {...props}><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="m19 5-14 14"/></svg>);
    case 'cancel':     return (<svg {...props}><circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/></svg>);
    case 'enter':      return (<svg {...props}><path d="M9 10h11V4M20 10l-7 7-9-9"/></svg>);
    case 'esc':        return (<svg {...props}><path d="m4 4 16 16M20 4 4 20"/></svg>);
    case 'logo':       return (<svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5zm3.5 5.5h7l-2.5 4 2.5 4h-7l2.5-4-2.5-4z"/></svg>);
    default:           return (<svg {...props}><circle cx="12" cy="12" r="9"/></svg>);
  }
};

// ---------------------------------------------------------------------------
// Money formatter — Brazil
const fmt = (n) => {
  const v = Math.max(0, Number(n) || 0);
  const [int, dec] = v.toFixed(2).split('.');
  return {
    full: int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec,
    int:  int.replace(/\B(?=(\d{3})+(?!\d))/g, '.'),
    dec,
  };
};

// Money component — splits cur / int / cents for type rhythm
const Money = ({ value, size = 'md', className = '' }) => {
  const { int, dec } = fmt(value);
  return (
    <span className={`money money-${size} ${className}`}>
      <span className="cur">R$</span>{int}<span className="cents">,{dec}</span>
    </span>
  );
};

// ---------------------------------------------------------------------------
// Animated counter — for total + dashboard numbers
const useCountUp = (target, duration = 480) => {
  const [v, setV] = React.useState(target);
  const startRef = React.useRef(target);
  React.useEffect(() => {
    const from = startRef.current;
    const to = target;
    if (from === to) return;
    let raf, t0;
    const step = (t) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else startRef.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
};

// ---------------------------------------------------------------------------
// Header
const Header = ({ user, date, onTheme, theme }) => (
  <header className="hdr">
    <div className="hdr-l">
      <div className="brand">
        <div className="brand-mark"><Icon name="logo" size={18}/></div>
        <div>
          <div className="brand-name">GestãoPRO</div>
          <div className="brand-sub">Ponto de Venda</div>
        </div>
      </div>
      <div className="nav">
        <button className="nav-btn is-active"><span className="dot"></span> Nova venda</button>
        <button className="nav-btn"><Icon name="history" size={14}/> Histórico</button>
        <button className="nav-btn"><Icon name="user" size={14}/> Clientes</button>
      </div>
    </div>
    <div className="hdr-r">
      <div className="date-pill"><span className="live"></span>{date} · {user.shift}</div>
      <button className="nav-btn" onClick={onTheme} title="Alternar tema"
              style={{ padding: '7px', background: 'var(--surf)', border: '1px solid var(--line)', borderRadius: 10 }}>
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14}/>
      </button>
      <div className="user-chip">
        <div className="user-av">{user.initials}</div>
        <div>
          <div className="user-name">{user.name.split(' ').slice(0, 2).join(' ')}</div>
          <div className="user-role">{user.role}</div>
        </div>
      </div>
    </div>
  </header>
);

// ---------------------------------------------------------------------------
// Top dashboard
const Dashboard = ({ today }) => {
  const total = useCountUp(today.total);
  const sumPay = today.payments.reduce((a, p) => a + p.total, 0) || 1;
  const goalPct = Math.min(100, Math.round((today.total / today.goal) * 100));
  const colorClass = (c) => `b-${c}`;
  const colorVar = { lime:'var(--c-lime)', violet:'var(--c-violet)', sky:'var(--c-sky)',
                     cyan:'var(--c-cyan)', amber:'var(--c-amber)', rose:'var(--c-rose)' };
  return (
    <div className="dash">
      <div className="dash-block">
        <div className="dash-label">Vendas de hoje</div>
        <div className="dash-num"><Money value={total}/></div>
        <div className="dash-meta">{today.sales} vendas concluídas · ticket médio <span className="tabnum" style={{color:'var(--t1)'}}>R$ {fmt(today.avgTicket).full}</span></div>
      </div>

      <div className="dash-block" style={{ gridColumn: 'span 2' }}>
        <div className="dash-label">Por forma de pagamento</div>
        <div className="dash-bar" aria-hidden="true">
          {today.payments.filter(p => p.total > 0).map(p => (
            <span key={p.id} className={colorClass(p.color)} style={{ width: `${(p.total / sumPay) * 100}%` }}/>
          ))}
        </div>
        <div className="legend">
          {today.payments.map(p => (
            <span key={p.id} className="legend-item">
              <span className="legend-dot" style={{ background: colorVar[p.color] }}></span>
              {p.label} <span className="legend-val">R$ {fmt(p.total).full}</span>
              <span className="legend-pct">{Math.round((p.total / sumPay) * 100)}%</span>
            </span>
          ))}
        </div>
      </div>

      <div className="dash-block dash-goal">
        <div className="dash-label">Meta do dia</div>
        <div className="dash-num" style={{ display:'flex', alignItems:'baseline', gap:8 }}>
          <span>{goalPct}<span className="cents">%</span></span>
        </div>
        <div className="dash-goal-track">
          <div className="dash-goal-fill" style={{ width: `${goalPct}%` }}></div>
        </div>
        <div className="dash-meta">
          R$ {fmt(today.total).full} de R$ {fmt(today.goal).full}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { Icon, Money, fmt, useCountUp, Header, Dashboard });
