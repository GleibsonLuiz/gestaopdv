// Catalog, Scanner, Cart, Payment modal, Recent sales

// ---------------------------------------------------------------------------
// Scanner / search input
const Scanner = ({ value, onChange, onSubmit, onPick, products }) => {
  const [focused, setFocused] = React.useState(false);
  const inpRef = React.useRef();

  React.useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && document.activeElement === inpRef.current) {
        onChange('');
        e.preventDefault();
      }
      if (e.key === '/' && document.activeElement !== inpRef.current) {
        e.preventDefault();
        inpRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onChange]);

  // Best-match suggestions when typing
  const suggestions = React.useMemo(() => {
    if (!value || value.length < 2) return [];
    const v = value.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(v)).slice(0, 4);
  }, [value, products]);

  return (
    <div className={`scan ${focused ? 'is-focused' : ''}`}>
      <div className="scan-icon"><Icon name="scan" size={18}/></div>
      <input
        ref={inpRef}
        value={value}
        placeholder="Bipe um produto ou digite código/nome — pressione Enter para adicionar"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (suggestions[0]) {
              onPick(suggestions[0]);
              onChange('');
            } else {
              onSubmit?.(value);
            }
          }
        }}
      />
      {suggestions.length > 0 && focused && (
        <div className="scan-sugg">
          {suggestions.map((s, i) => (
            <button key={s.id} className="scan-sugg-row"
                    onMouseDown={(e) => { e.preventDefault(); onPick(s); onChange(''); }}>
              <span className="scan-sugg-icon"><Icon name={s.icon} size={14}/></span>
              <span className="scan-sugg-name">{s.name}</span>
              <span className="scan-sugg-price">R$ {fmt(s.price).full}</span>
              {i === 0 && <span className="kbd kbd-accent">↵</span>}
            </button>
          ))}
        </div>
      )}
      <span className="scan-hint">
        <span className="kbd">/</span> focar &nbsp;·&nbsp; <span className="kbd kbd-accent">Enter</span> adicionar
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Catalog
const Catalog = ({ products, categories, onAdd, layout, onLayout }) => {
  const [tab, setTab] = React.useState('top');
  const filtered = React.useMemo(() => {
    if (tab === 'top') return products.filter(p => p.top);
    if (tab === 'todos') return products;
    return products.filter(p => p.cat === tab);
  }, [products, tab]);

  return (
    <div className={`card catalog ${layout === 'list' ? 'list-mode' : ''}`}>
      <div className="card-hd">
        <div>
          <div className="card-title">
            <Icon name={tab === 'top' ? 'flame' : 'grid'} size={14}/>
            {categories.find(c => c.id === tab)?.label || 'Catálogo'}
            <span className="pill">{filtered.length}</span>
          </div>
          <div className="card-sub" style={{ marginTop: 4 }}>Clique para adicionar à venda · arraste para reordenar</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="tabs">
            {categories.map(c => (
              <button key={c.id} className={`tab ${tab === c.id ? 'is-active' : ''}`} onClick={() => setTab(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="tabs" style={{ padding: 2 }}>
            <button className={`tab ${layout === 'grid' ? 'is-active' : ''}`} onClick={() => onLayout('grid')} title="Grade" style={{ padding: '6px 8px' }}><Icon name="grid" size={13}/></button>
            <button className={`tab ${layout === 'list' ? 'is-active' : ''}`} onClick={() => onLayout('list')} title="Lista" style={{ padding: '6px 8px' }}><Icon name="list" size={13}/></button>
          </div>
        </div>
      </div>

      <div className="grid">
        {filtered.map(p => (
          <button key={p.id} className="prod" onClick={() => onAdd(p)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div className="prod-icon"><Icon name={p.icon} size={15}/></div>
              {p.badge && <span className="prod-stock">{p.badge}</span>}
            </div>
            <div className="prod-name">{p.name}</div>
            <div className="prod-foot">
              <span className="prod-price">R$ {fmt(p.price).full}</span>
            </div>
            <div className="prod-add"><Icon name="plus" size={12} stroke={2.4}/></div>
          </button>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Cart
const Cart = ({ items, onInc, onDec, onRemove, onClear, onFinalize, payment, onPayment, paymentMethods }) => {
  const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
  const total = subtotal;
  const animTotal = useCountUp(total);
  const itemCount = items.reduce((a, i) => a + i.qty, 0);

  return (
    <div className="card cart">
      <div className="cart-hd">
        <div className="cart-title">
          <Icon name="cart" size={14}/>
          Cestinha
          <span className="cart-count">{itemCount} {itemCount === 1 ? 'item' : 'itens'}</span>
        </div>
        {items.length > 0 && (
          <button className="cart-clear" onClick={onClear}>Limpar</button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="cart-empty">
          <div className="cart-empty-mark"><Icon name="cart-empty" size={22}/></div>
          <div>
            <div className="cart-empty-title">Nenhum item ainda</div>
            <div className="cart-empty-sub">Bipe um produto, digite o nome ou clique no catálogo ao lado.</div>
          </div>
        </div>
      ) : (
        <div className="cart-list">
          {items.map(i => (
            <div key={i.id} className="cart-item">
              <div>
                <div className="cart-item-name">{i.name}</div>
                <div className="cart-item-meta">
                  <div className="qty">
                    <button onClick={() => onDec(i.id)}><Icon name="minus" size={11} stroke={2.2}/></button>
                    <span>{i.qty}</span>
                    <button onClick={() => onInc(i.id)}><Icon name="plus" size={11} stroke={2.2}/></button>
                  </div>
                  <span className="muted tabnum">× R$ {fmt(i.price).full}</span>
                </div>
              </div>
              <div className="cart-item-price">R$ {fmt(i.price * i.qty).full}</div>
              <button className="cart-item-rm" onClick={() => onRemove(i.id)}><Icon name="x" size={12} stroke={2.4}/></button>
            </div>
          ))}
        </div>
      )}

      <div className="cart-foot">
        <div className="subtot">
          <span>Subtotal · {itemCount} {itemCount === 1 ? 'item' : 'itens'}</span>
          <strong>R$ {fmt(subtotal).full}</strong>
        </div>

        <div className="total-row">
          <div>
            <div className="total-lbl">Total</div>
          </div>
          <div className="total-num">
            <span className="cur">R$</span>{fmt(animTotal).int}<span className="cents">,{fmt(animTotal).dec}</span>
          </div>
        </div>

        <button className="btn-finalize" disabled={items.length === 0} onClick={onFinalize}>
          Finalizar venda
          <span className="kbd">F10</span>
          <Icon name="arrow-right" size={14}/>
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sidebar Payment quick-pick (preview / pre-select)
const PaymentQuick = ({ methods, selected, onSelect }) => (
  <div className="card">
    <div className="card-hd">
      <div className="card-title"><Icon name="cash" size={14}/> Forma de pagamento</div>
      <span className="card-sub">F1 – F6</span>
    </div>
    <div className="pay-grid">
      {methods.map(m => (
        <button
          key={m.id}
          className={`pay-btn pay-c-${m.color} ${selected === m.id ? 'is-active' : ''}`}
          onClick={() => onSelect(m.id)}
        >
          <div className="pay-row">
            <div className="pay-icon"><Icon name={m.icon} size={12}/></div>
            <span className="pay-key">{m.shortcut}</span>
          </div>
          <div className="pay-lbl">{m.label}</div>
        </button>
      ))}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Shortcuts list
const Shortcuts = ({ shortcuts }) => (
  <div className="card">
    <div className="card-hd">
      <div className="card-title"><Icon name="sparkles" size={14}/> Atalhos rápidos</div>
    </div>
    <div className="short">
      {shortcuts.map((s, i) => (
        <div key={i} className="short-row">
          <span>{s.label}</span>
          <span className="short-keys">
            {s.keys.map((k, j) => (
              <span key={j} className={`kbd ${k === 'Enter' ? 'kbd-accent' : ''} ${k === 'Esc' ? 'kbd-warn' : ''}`}>{k}</span>
            ))}
          </span>
        </div>
      ))}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Recent sales
const RecentSales = ({ sales, methods }) => {
  const colorMap = methods.reduce((m, p) => ({ ...m, [p.id]: p.color }), {});
  const labelMap = methods.reduce((m, p) => ({ ...m, [p.id]: p.label }), {});
  const colorVar = { lime:'var(--c-lime)', violet:'var(--c-violet)', sky:'var(--c-sky)',
                     cyan:'var(--c-cyan)', amber:'var(--c-amber)', rose:'var(--c-rose)' };
  return (
    <div className="card">
      <div className="card-hd">
        <div>
          <div className="card-title"><Icon name="history" size={14}/> Últimas vendas deste caixa</div>
          <div className="card-sub" style={{ marginTop: 4 }}>Toque em uma venda para ver detalhes ou reimprimir cupom</div>
        </div>
        <button className="nav-btn">Ver todas <Icon name="arrow-right" size={12}/></button>
      </div>
      <div className="recent">
        {sales.map(s => (
          <div key={s.id} className="rec-row">
            <span className="rec-id">#{s.id}</span>
            <span className="rec-cust">{s.customer}</span>
            <span className="rec-method">
              <span className="legend-dot" style={{ background: colorVar[colorMap[s.method]] }}></span>
              {labelMap[s.method]}
            </span>
            <span className="rec-total">R$ {fmt(s.total).full}</span>
            <span className="rec-time">{s.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Payment modal — appears when finalizing
const PaymentModal = ({ items, methods, onClose, onConfirm }) => {
  const total = items.reduce((a, i) => a + i.price * i.qty, 0);
  const [method, setMethod] = React.useState('dinheiro');
  const [customer, setCustomer] = React.useState('');
  const [phase, setPhase] = React.useState('pay'); // pay -> processing -> success
  const [saleId, setSaleId] = React.useState(null);

  React.useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose();
      if (phase === 'pay') {
        const f = methods.find(m => m.shortcut.toLowerCase() === e.key.toLowerCase());
        if (f) setMethod(f.id);
        if (e.key === 'Enter') confirm();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const confirm = () => {
    setPhase('processing');
    setTimeout(() => {
      const newId = 208;
      setSaleId(newId);
      setPhase('success');
      onConfirm({ id: newId, customer: customer || 'Consumidor', method, total });
    }, 700);
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {phase === 'success' ? (
          <div>
            <div className="modal-success">
              <div className="success-mark"><Icon name="check" size={36} stroke={2.2}/></div>
              <div className="success-title">Venda concluída</div>
              <div className="success-sub">R$ {fmt(total).full} via {methods.find(m => m.id === method)?.label}</div>
              <div className="success-nfe">
                <span>Cupom · <code>#{saleId}</code></span>
                <span>NFC-e enviada</span>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-ghost" onClick={onClose}>Reimprimir cupom</button>
              <button className="btn-finalize" onClick={onClose}>
                Nova venda <span className="kbd">Enter</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="modal-hd">
              <div>
                <div className="modal-title">Finalizar venda</div>
                <div className="modal-sub">{items.length} {items.length === 1 ? 'item' : 'itens'} · revise o total e selecione a forma de pagamento</div>
              </div>
              <button className="modal-x" onClick={onClose}><Icon name="x" size={14}/></button>
            </div>

            <div className="modal-amount">
              <div>
                <div className="modal-amount-lbl">Total a receber</div>
                <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 4 }}>{items.reduce((a,i)=>a+i.qty,0)} produtos · sem desconto</div>
              </div>
              <div className="modal-amount-num">
                <span className="cur">R$</span>{fmt(total).int}<span className="cents">,{fmt(total).dec}</span>
              </div>
            </div>

            <div className="modal-pay-grid">
              {methods.map(m => (
                <button
                  key={m.id}
                  className={`modal-pay-btn pay-c-${m.color} ${method === m.id ? 'is-active' : ''}`}
                  onClick={() => setMethod(m.id)}
                >
                  <div className="pay-row">
                    <div className="pay-icon"><Icon name={m.icon} size={14}/></div>
                    <span className="pay-key kbd">{m.shortcut}</span>
                  </div>
                  <div className="pay-lbl">{m.label}</div>
                </button>
              ))}
            </div>

            <div className="modal-cliente">
              <input
                placeholder="Cliente (opcional) · CPF, telefone ou nome"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
              />
            </div>

            <div className="modal-foot">
              <button className="btn-ghost" onClick={onClose}>Cancelar <span className="kbd kbd-warn" style={{ marginLeft: 6 }}>Esc</span></button>
              <button className="btn-finalize" onClick={confirm} disabled={phase === 'processing'}>
                {phase === 'processing' ? 'Processando…' : 'Confirmar pagamento'}
                <span className="kbd">Enter</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { Scanner, Catalog, Cart, PaymentQuick, Shortcuts, RecentSales, PaymentModal });
