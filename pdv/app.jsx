// Main App composition + global keyboard handlers + tweaks

const { useState, useEffect, useMemo, useCallback } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#34d399",
  "density": "regular",
  "dark": true,
  "layout": "grid",
  "showDashboard": true
}/*EDITMODE-END*/;

const ACCENT_OPTIONS = [
  '#34d399', // mint (default)
  '#60a5fa', // sky
  '#a78bfa', // violet
  '#f59e0b', // amber
  '#fb7185', // rose
  '#facc15', // yellow
];

function App() {
  const data = window.PDV_DATA;
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [layout, setLayout] = useState(t.layout);
  const [paymentSel, setPaymentSel] = useState('dinheiro');
  const [showModal, setShowModal] = useState(false);
  const [recent, setRecent] = useState(data.recentSales);
  const [today, setToday] = useState(data.today);

  // Apply theme + accent to root
  useEffect(() => {
    document.documentElement.dataset.theme = t.dark ? 'dark' : 'light';
    document.documentElement.dataset.density = t.density;
    document.documentElement.style.setProperty('--accent', t.accent);
    // Derive lighter/glow from accent
    const glow = hexToRgba(t.accent, 0.25);
    document.documentElement.style.setProperty('--accent-glow', glow);
    document.documentElement.style.setProperty('--accent-2', shade(t.accent, 18));
  }, [t.dark, t.density, t.accent]);

  useEffect(() => setLayout(t.layout), [t.layout]);

  // ----- Cart actions
  const addItem = useCallback((p) => {
    setItems(prev => {
      const found = prev.find(i => i.id === p.id);
      if (found) return prev.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: p.id, name: p.name, price: p.price, qty: 1 }];
    });
  }, []);
  const inc = useCallback((id) => setItems(prev => prev.map(i => i.id === id ? { ...i, qty: i.qty + 1 } : i)), []);
  const dec = useCallback((id) => setItems(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty - 1) } : i)), []);
  const rm  = useCallback((id) => setItems(prev => prev.filter(i => i.id !== id)), []);
  const clr = useCallback(() => setItems([]), []);

  const finalize = useCallback(() => {
    if (items.length > 0) setShowModal(true);
  }, [items.length]);

  const onConfirm = useCallback(({ id, customer, method, total }) => {
    setRecent(r => [{ id, customer, method, total, time: new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) }, ...r].slice(0, 8));
    setToday(prev => {
      const payments = prev.payments.map(p => p.id === method ? { ...p, total: p.total + total, count: p.count + 1 } : p);
      const newTotal = prev.total + total;
      const newSales = prev.sales + 1;
      return { ...prev, total: newTotal, sales: newSales, avgTicket: newTotal / newSales, payments };
    });
    // Clear cart after a short success display
    setTimeout(() => setItems([]), 1800);
  }, []);

  // ----- Global keyboard
  useEffect(() => {
    const h = (e) => {
      // Ignore when typing in real inputs (modal handles its own keys)
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (showModal) return; // modal owns keys
      if (e.key === 'F10') { e.preventDefault(); finalize(); }
      if (e.key === 'F8')  { e.preventDefault(); setItems(prev => prev.slice(0, -1)); }
      if (e.key === 'Escape') { setQuery(''); }
      // F1-F6 select payment
      const idx = ['F1','F2','F3','F4','F5','F6'].indexOf(e.key);
      if (idx >= 0) {
        e.preventDefault();
        setPaymentSel(data.paymentMethods[idx].id);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [finalize, showModal, data.paymentMethods]);

  return (
    <div className="app">
      <Header
        user={data.user}
        date={today.date}
        theme={t.dark ? 'dark' : 'light'}
        onTheme={() => setTweak('dark', !t.dark)}
      />

      {t.showDashboard && <Dashboard today={today}/>}

      <Scanner
        value={query}
        onChange={setQuery}
        onPick={addItem}
        products={data.products}
      />

      <div className="main">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Catalog
            products={data.products}
            categories={data.categories}
            onAdd={addItem}
            layout={layout}
            onLayout={(v) => { setLayout(v); setTweak('layout', v); }}
          />
          <RecentSales sales={recent} methods={data.paymentMethods}/>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 16 }}>
          <Cart
            items={items}
            onInc={inc}
            onDec={dec}
            onRemove={rm}
            onClear={clr}
            onFinalize={finalize}
            payment={paymentSel}
            onPayment={setPaymentSel}
            paymentMethods={data.paymentMethods}
          />
          <PaymentQuick
            methods={data.paymentMethods}
            selected={paymentSel}
            onSelect={setPaymentSel}
          />
          <Shortcuts shortcuts={data.shortcuts}/>
        </div>
      </div>

      {showModal && (
        <PaymentModal
          items={items}
          methods={data.paymentMethods}
          onClose={() => setShowModal(false)}
          onConfirm={onConfirm}
        />
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Tema"/>
        <TweakToggle label="Modo escuro" value={t.dark} onChange={(v) => setTweak('dark', v)}/>
        <TweakColor   label="Cor de destaque" value={t.accent}
                      options={ACCENT_OPTIONS}
                      onChange={(v) => setTweak('accent', v)}/>
        <TweakSection label="Layout"/>
        <TweakRadio   label="Densidade" value={t.density}
                      options={['compact','regular','comfy']}
                      onChange={(v) => setTweak('density', v)}/>
        <TweakRadio   label="Catálogo" value={t.layout}
                      options={['grid','list']}
                      onChange={(v) => { setTweak('layout', v); setLayout(v); }}/>
        <TweakToggle  label="Mostrar dashboard" value={t.showDashboard}
                      onChange={(v) => setTweak('showDashboard', v)}/>
        <TweakSection label="Demo"/>
        <TweakButton  label="Adicionar 3 itens de exemplo" onClick={() => {
          const sample = data.products.filter(p => p.top).slice(0, 3);
          sample.forEach(addItem);
        }}/>
        <TweakButton  label="Limpar carrinho" onClick={clr}/>
      </TweaksPanel>

      <div style={{ height: 24 }}/>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Color helpers
function hexToRgba(hex, alpha) {
  const h = hex.replace('#','');
  const f = h.length === 3 ? h.split('').map(c=>c+c).join('') : h;
  const r = parseInt(f.slice(0,2),16), g = parseInt(f.slice(2,4),16), b = parseInt(f.slice(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function shade(hex, percent) {
  const h = hex.replace('#','');
  const f = h.length === 3 ? h.split('').map(c=>c+c).join('') : h;
  let r = parseInt(f.slice(0,2),16), g = parseInt(f.slice(2,4),16), b = parseInt(f.slice(4,6),16);
  r = Math.min(255, r + (255 - r) * (percent/100));
  g = Math.min(255, g + (255 - g) * (percent/100));
  b = Math.min(255, b + (255 - b) * (percent/100));
  return '#' + [r,g,b].map(x => Math.round(x).toString(16).padStart(2,'0')).join('');
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
