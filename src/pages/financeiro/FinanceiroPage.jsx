import { useCallback, useEffect, useMemo, useState } from 'react';
import './tokens.css';
import Topbar       from './components/Topbar';
import PageHeader   from './components/PageHeader';
import TabsBar      from './components/TabsBar';
import KpiCard      from './components/KpiCard';
import FiltersBar   from './components/FiltersBar';
import BillsTable   from './components/BillsTable';
import { api } from '../../lib/api.js';
import {
  ContaModal,
  PagarReceberModal,
  AnexosModal,
} from '../../Financeiro.jsx';

const TONES_LIST = ['c1', 'c2', 'c3', 'c4', 'c5'];

function hashTone(s) {
  if (!s) return 'c1';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TONES_LIST[h % TONES_LIST.length];
}

function iniciaisDe(nome) {
  if (!nome) return '—';
  const partes = nome.trim().split(/\s+/);
  const ini = (partes[0]?.[0] || '') + (partes[1]?.[0] || partes[0]?.[1] || '');
  return ini.toUpperCase().slice(0, 2);
}

function diasDiff(iso) {
  if (!iso) return 0;
  const venc = new Date(iso);
  venc.setHours(0, 0, 0, 0);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((venc - hoje) / 86400000);
}

function statusEfetivo(c) {
  if (c.status === 'PAGA' || c.status === 'CANCELADA') return c.status;
  return diasDiff(c.vencimento) < 0 ? 'ATRASADA' : 'PENDENTE';
}

function fmtData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function fmtBRL(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function splitValor(v) {
  const n = Number(v) || 0;
  const inteiro = Math.floor(Math.abs(n));
  const cents = Math.round((Math.abs(n) - inteiro) * 100);
  return {
    amount: inteiro.toLocaleString('pt-BR'),
    cents: String(cents).padStart(2, '0'),
  };
}

function statusUI(c) {
  const ef = statusEfetivo(c);
  if (c.status === 'CANCELADA') return 'canceled';
  if (ef === 'PAGA') return 'paid';
  if (ef === 'ATRASADA') return 'late';
  if (ef === 'PENDENTE') {
    const d = diasDiff(c.vencimento);
    if (d <= 7) return 'soon';
    return 'pending';
  }
  return 'pending';
}

function dueStateUI(c) {
  if (c.status === 'PAGA') return 'paid';
  const d = diasDiff(c.vencimento);
  if (d < 0) return 'late';
  if (d === 0) return 'today';
  return 'soon';
}

function dueRel(c, ehPagar) {
  if (c.status === 'PAGA') {
    const dt = c.pagamento || c.recebimento;
    return dt
      ? `✓ ${ehPagar ? 'pago' : 'recebido'} em ${fmtData(dt)}`
      : '✓ quitada';
  }
  if (c.status === 'CANCELADA') return 'cancelada';
  const d = diasDiff(c.vencimento);
  if (d < 0) return `▾ ${Math.abs(d)} dia${Math.abs(d) === 1 ? '' : 's'} atrasada`;
  if (d === 0) return '● vence hoje';
  return `em ${d} dia${d === 1 ? '' : 's'}`;
}

function billFromConta(c, ehPagar) {
  const ent = ehPagar ? c.fornecedor : c.cliente;
  const nome = ent?.nome || '';
  const { amount, cents } = splitValor(c.valor);
  const isParcelada = c.tipoRecorrencia === 'PARCELADA';
  const isRecorrente = c.tipoRecorrencia === 'RECORRENTE';
  const parcela =
    (isParcelada || isRecorrente) && c.parcelaTotal
      ? `${isParcelada ? '📋' : '🔁'} ${c.parcelaAtual}/${c.parcelaTotal}`
      : null;

  return {
    id: c.id,
    raw: c,
    ref: c.descricao,
    sub: c.observacoes || null,
    parcela,
    supplier: nome,
    supplierShort: iniciaisDe(nome),
    supplierTone: hashTone(ent?.id || nome),
    dueDate: fmtData(c.vencimento),
    dueRel: dueRel(c, ehPagar),
    dueState: dueStateUI(c),
    amount,
    cents,
    status: statusUI(c),
    attachments: c.anexos?.length || 0,
  };
}

function calcularKpis(contas, ehPagar) {
  let totPend = 0, qPend = 0;
  let totAtr = 0, qAtr = 0;
  let totPago = 0, qPago = 0;
  let totProx = 0, qProx = 0;
  let totGeral = 0;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const em7 = new Date(hoje); em7.setDate(em7.getDate() + 7);

  for (const c of contas) {
    const v = Number(c.valor) || 0;
    const ef = statusEfetivo(c);
    if (c.status === 'CANCELADA') continue;
    totGeral += v;
    if (ef === 'PAGA') { totPago += v; qPago++; }
    else if (ef === 'ATRASADA') { totAtr += v; qAtr++; }
    else if (ef === 'PENDENTE') {
      totPend += v; qPend++;
      const dv = new Date(c.vencimento);
      if (dv <= em7) { totProx += v; qProx++; }
    }
  }

  const pct = (n) => totGeral > 0 ? Math.round((n / totGeral) * 100) : 0;

  return [
    {
      id: 'pendentes',
      label: 'Pendentes',
      icon: 'clock',
      tone: 'amber',
      ...splitVal(totPend),
      footLeft: `${qPend} ${qPend === 1 ? 'conta' : 'contas'}`,
      progress: pct(totPend),
    },
    {
      id: 'atrasadas',
      label: 'Atrasadas',
      icon: 'alert',
      tone: 'coral',
      ...splitVal(totAtr),
      footLeft: `${qAtr} ${qAtr === 1 ? 'conta' : 'contas'}`,
      progress: pct(totAtr),
    },
    {
      id: 'vencendo',
      label: 'Vencendo em 7 dias',
      icon: 'calendar',
      tone: 'iris',
      ...splitVal(totProx),
      footLeft: `${qProx} ${qProx === 1 ? 'conta' : 'contas'}`,
      progress: pct(totProx),
    },
    {
      id: 'pagas',
      label: ehPagar ? 'Pagas' : 'Recebidas',
      icon: 'check',
      tone: 'emerald',
      ...splitVal(totPago),
      footLeft: `${qPago} ${qPago === 1 ? 'conta' : 'contas'}`,
      progress: pct(totPago),
    },
  ];
}

function splitVal(n) {
  const { amount, cents } = splitValor(n);
  return { value: amount, cents };
}

export default function FinanceiroPage({ user }) {
  const podeEditar = user?.role === 'ADMIN' || user?.role === 'GERENTE';
  const [aba, setAba] = useState('pagar');
  const [contagens, setContagens] = useState({ pagar: null, receber: null });

  function setCount(tipo, n) {
    setContagens(prev => prev[tipo] === n ? prev : { ...prev, [tipo]: n });
  }

  return (
    <div className="financeiro-bg min-h-screen text-fg font-sans antialiased tracking-tightish -mx-6 -my-6">
      <div className="max-w-[1320px] mx-auto px-8 pt-7 pb-20">
        <Topbar user={user?.nome} initials={iniciaisDe(user?.nome)} />
        <PageHeader />

        <FinanceiroTabs
          aba={aba}
          setAba={setAba}
          podeEditar={podeEditar}
          contagens={contagens}
          setCount={setCount}
        />
      </div>
    </div>
  );
}

function FinanceiroTabs({ aba, setAba, podeEditar, contagens, setCount }) {
  const tabs = [
    { id: 'pagar',   label: 'A pagar',        count: contagens.pagar ?? undefined,   icon: 'inbox' },
    { id: 'receber', label: 'A receber',      count: contagens.receber ?? undefined, icon: 'arrow-down' },
    { id: 'fluxo',   label: 'Fluxo de caixa',                                        icon: 'pulse' },
    { id: 'concil',  label: 'Conciliação',                                           icon: 'rows' },
  ];

  const [novoAberto, setNovoAberto] = useState(false);
  const novoTipo = aba === 'receber' ? 'receber' : 'pagar';

  return (
    <>
      <TabsBar
        tabs={tabs}
        active={aba}
        onChange={setAba}
        onNew={
          podeEditar && (aba === 'pagar' || aba === 'receber')
            ? () => setNovoAberto(true)
            : null
        }
        novoLabel={`Nova conta ${aba === 'receber' ? 'a receber' : 'a pagar'}`}
      />

      {aba === 'pagar' && (
        <ContasView
          tipo="pagar"
          podeEditar={podeEditar}
          onContas={(lista) => setCount('pagar', lista.length)}
        />
      )}
      {aba === 'receber' && (
        <ContasView
          tipo="receber"
          podeEditar={podeEditar}
          onContas={(lista) => setCount('receber', lista.length)}
        />
      )}
      {aba === 'fluxo' && <FluxoView />}
      {aba === 'concil' && <ConcilView />}

      {novoAberto && (
        <ContaModalReloader
          tipo={novoTipo}
          onFechar={() => setNovoAberto(false)}
        />
      )}
    </>
  );
}

function ContaModalReloader({ tipo, onFechar }) {
  const [entidades, setEntidades] = useState([]);

  useEffect(() => {
    const promise = tipo === 'pagar'
      ? api.listarFornecedores({ ativo: 'true' })
      : api.listarClientes({ ativo: 'true' });
    promise.then(setEntidades).catch(() => {});
  }, [tipo]);

  return (
    <ContaModal
      tipo={tipo}
      entidades={entidades}
      onCancelar={onFechar}
      onSalvar={() => {
        onFechar();
        // Sinaliza para a aba ativa recarregar.
        window.dispatchEvent(new CustomEvent('financeiro:reload', { detail: { tipo } }));
      }}
    />
  );
}

function ContasView({ tipo, podeEditar, onContas }) {
  const ehPagar = tipo === 'pagar';
  const [contas, setContas] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [entidadeId, setEntidadeId] = useState('');
  const [vencidas, setVencidas] = useState(false);
  const [entidades, setEntidades] = useState([]);

  const [editando, setEditando] = useState(null);
  const [pagando, setPagando] = useState(null);
  const [anexando, setAnexando] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const args = {
        search,
        status,
        vencidas: vencidas ? 'true' : '',
      };
      if (ehPagar) args.fornecedorId = entidadeId;
      else args.clienteId = entidadeId;
      const data = ehPagar
        ? await api.listarContasPagar(args)
        : await api.listarContasReceber(args);
      const lista = Array.isArray(data) ? data : [];
      setContas(lista);
      onContas?.(lista);
    } catch (err) {
      setErro(err.message || 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  }, [ehPagar, search, status, entidadeId, vencidas, onContas]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    const promise = ehPagar
      ? api.listarFornecedores({ ativo: 'true' })
      : api.listarClientes({ ativo: 'true' });
    promise.then(setEntidades).catch(() => {});
  }, [ehPagar]);

  useEffect(() => {
    function onReload(e) {
      if (!e.detail || e.detail.tipo === tipo) carregar();
    }
    window.addEventListener('financeiro:reload', onReload);
    return () => window.removeEventListener('financeiro:reload', onReload);
  }, [tipo, carregar]);

  const kpis = useMemo(() => calcularKpis(contas, ehPagar), [contas, ehPagar]);
  const bills = useMemo(() => contas.map(c => billFromConta(c, ehPagar)), [contas, ehPagar]);

  const totalFiltrado = useMemo(() => {
    const sum = contas
      .filter(c => c.status !== 'CANCELADA')
      .reduce((acc, c) => acc + (Number(c.valor) || 0), 0);
    return fmtBRL(sum);
  }, [contas]);

  function limpar() {
    setSearch(''); setStatus(''); setEntidadeId(''); setVencidas(false);
  }

  async function executarPagar(payload) {
    if (!pagando) return;
    try {
      if (ehPagar) await api.pagarConta(pagando.id, payload);
      else await api.receberConta(pagando.id, payload);
      setPagando(null);
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  async function executarReabrir(bill) {
    if (!confirm('Reabrir esta conta? O lançamento será removido.')) return;
    try {
      if (ehPagar) await api.reabrirContaPagar(bill.id);
      else await api.reabrirContaReceber(bill.id);
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  async function executarCancelar(bill) {
    if (!confirm('Cancelar esta conta? Esta ação não pode ser desfeita facilmente.')) return;
    try {
      if (ehPagar) await api.cancelarContaPagar(bill.id);
      else await api.cancelarContaReceber(bill.id);
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        {kpis.map(k => <KpiCard key={k.id} kpi={k} />)}
      </div>

      <FiltersBar
        search={search} onSearch={setSearch}
        status={status} onStatus={setStatus}
        entidadeId={entidadeId} onEntidade={setEntidadeId}
        vencidas={vencidas} onVencidas={setVencidas}
        entidades={entidades}
        entidadeLabel={ehPagar ? 'fornecedores' : 'clientes'}
        onLimpar={limpar}
      />

      <BillsTable
        bills={bills}
        ehPagar={ehPagar}
        podeEditar={podeEditar}
        carregando={carregando}
        erro={erro}
        totalFiltrado={totalFiltrado}
        onPay={(b) => setPagando(b.raw)}
        onEdit={(b) => setEditando(b.raw)}
        onAttach={(b) => setAnexando(b.raw)}
        onReabrir={(b) => executarReabrir(b.raw)}
        onCancelar={(b) => executarCancelar(b.raw)}
      />

      {editando && (
        <ContaModal
          tipo={tipo}
          conta={editando}
          entidades={entidades}
          onCancelar={() => setEditando(null)}
          onSalvar={() => { setEditando(null); carregar(); }}
        />
      )}

      {pagando && (
        <PagarReceberModal
          tipo={tipo}
          conta={pagando}
          podeEditar={podeEditar}
          onCancelar={() => setPagando(null)}
          onConfirmar={executarPagar}
        />
      )}

      {anexando && (
        <AnexosModal
          tipo={tipo}
          conta={anexando}
          podeEditar={podeEditar}
          onFechar={() => { setAnexando(null); carregar(); }}
        />
      )}
    </>
  );
}

function useContasFinanceiro() {
  const [contasPagar, setContasPagar] = useState([]);
  const [contasReceber, setContasReceber] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const recarregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const [pagar, receber] = await Promise.all([
        api.listarContasPagar({}),
        api.listarContasReceber({}),
      ]);
      setContasPagar(Array.isArray(pagar) ? pagar : []);
      setContasReceber(Array.isArray(receber) ? receber : []);
    } catch (err) {
      setErro(err.message || 'Erro ao carregar contas');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  useEffect(() => {
    function onReload() { recarregar(); }
    window.addEventListener('financeiro:reload', onReload);
    return () => window.removeEventListener('financeiro:reload', onReload);
  }, [recarregar]);

  return { contasPagar, contasReceber, carregando, erro };
}

function FluxoView() {
  const { contasPagar, contasReceber, carregando, erro } = useContasFinanceiro();

  const linhas = useMemo(() => {
    const items = [];
    for (const c of contasPagar) {
      if (c.status === 'CANCELADA') continue;
      items.push({
        id: `p-${c.id}`,
        tipo: 'saida',
        data: c.status === 'PAGA' ? (c.pagamento || c.vencimento) : c.vencimento,
        descricao: c.descricao,
        entidade: c.fornecedor?.nome || '—',
        valor: -Math.abs(Number(c.valor) || 0),
        status: statusEfetivo(c),
      });
    }
    for (const c of contasReceber) {
      if (c.status === 'CANCELADA') continue;
      items.push({
        id: `r-${c.id}`,
        tipo: 'entrada',
        data: c.status === 'PAGA' ? (c.recebimento || c.vencimento) : c.vencimento,
        descricao: c.descricao,
        entidade: c.cliente?.nome || '—',
        valor: Math.abs(Number(c.valor) || 0),
        status: statusEfetivo(c),
      });
    }
    items.sort((a, b) => new Date(a.data) - new Date(b.data));
    let saldo = 0;
    return items.map(it => {
      saldo += it.valor;
      return { ...it, saldo };
    });
  }, [contasPagar, contasReceber]);

  const totalEntradas = linhas.filter(l => l.tipo === 'entrada').reduce((a, l) => a + l.valor, 0);
  const totalSaidas = linhas.filter(l => l.tipo === 'saida').reduce((a, l) => a + l.valor, 0);
  const saldoFinal = totalEntradas + totalSaidas;

  if (carregando) {
    return (
      <div className="bg-surface border border-hairline-soft rounded-card p-10 text-center text-fg-muted text-sm">
        Carregando…
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bg-surface border border-hairline-soft rounded-card p-10 text-center text-coral text-sm">
        {erro}
      </div>
    );
  }

  if (linhas.length === 0) {
    return (
      <div className="bg-surface border border-hairline-soft rounded-card p-10 text-center text-fg-muted text-sm">
        Nenhuma conta cadastrada para compor o fluxo.
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-6">
        <KpiCardSimples
          label="Entradas previstas/realizadas"
          tone="emerald"
          value={fmtBRL(totalEntradas)}
          foot={`${linhas.filter(l => l.tipo === 'entrada').length} lançamentos`}
        />
        <KpiCardSimples
          label="Saídas previstas/realizadas"
          tone="coral"
          value={fmtBRL(totalSaidas)}
          foot={`${linhas.filter(l => l.tipo === 'saida').length} lançamentos`}
        />
        <KpiCardSimples
          label="Saldo projetado"
          tone={saldoFinal >= 0 ? 'iris' : 'coral'}
          value={fmtBRL(saldoFinal)}
          foot={saldoFinal >= 0 ? 'positivo' : 'negativo'}
        />
      </div>

      <div className="bg-surface border border-hairline-soft rounded-card shadow-card overflow-hidden">
        <div className="flex items-center justify-between p-[14px_18px] border-b border-hairline-soft">
          <div className="text-fg-soft text-[13px] font-medium">
            Fluxo de caixa <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-full bg-white/[.04] text-fg-muted border border-hairline-soft tnum">{linhas.length}</span>
            <span className="text-fg-faint font-normal text-[12.5px] ml-2">· ordenado por data</span>
          </div>
        </div>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-black/[.12]">
              <ThSimple>Data</ThSimple>
              <ThSimple>Descrição</ThSimple>
              <ThSimple>Origem</ThSimple>
              <ThSimple align="right">Valor</ThSimple>
              <ThSimple align="right" last>Saldo</ThSimple>
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.id} className="border-b border-hairline-soft last:border-b-0 hover:bg-white/[.025]">
                <td className="p-[14px_18px] align-middle font-mono text-fg-soft">{fmtData(l.data)}</td>
                <td className="p-[14px_18px] align-middle text-fg">{l.descricao}</td>
                <td className="p-[14px_18px] align-middle text-fg-muted">{l.entidade}</td>
                <td className={`p-[14px_18px] align-middle text-right font-mono font-medium ${l.tipo === 'entrada' ? 'text-emerald2' : 'text-coral'}`}>
                  {l.tipo === 'entrada' ? '+' : ''}{fmtBRL(l.valor)}
                </td>
                <td className={`p-[14px_18px] align-middle text-right font-mono font-medium ${l.saldo >= 0 ? 'text-fg' : 'text-coral'}`}>
                  {fmtBRL(l.saldo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ConcilView() {
  const { contasPagar, contasReceber, carregando, erro } = useContasFinanceiro();

  const grupos = useMemo(() => {
    const map = new Map();
    function add(c, tipo) {
      if (c.status !== 'PAGA') return;
      const dt = c.pagamento || c.recebimento;
      if (!dt) return;
      const key = new Date(dt).toISOString().slice(0, 10);
      const item = map.get(key) || {
        data: key, entradas: 0, saidas: 0, qtd: 0, contas: [],
      };
      const v = Number(c.valor) || 0;
      if (tipo === 'pagar') item.saidas += v;
      else item.entradas += v;
      item.qtd++;
      item.contas.push({
        id: c.id, tipo, descricao: c.descricao, valor: v,
        forma: c.formaPagamento || '—',
      });
      map.set(key, item);
    }
    contasPagar.forEach(c => add(c, 'pagar'));
    contasReceber.forEach(c => add(c, 'receber'));
    return [...map.values()].sort((a, b) => b.data.localeCompare(a.data));
  }, [contasPagar, contasReceber]);

  if (carregando) {
    return (
      <div className="bg-surface border border-hairline-soft rounded-card p-10 text-center text-fg-muted text-sm">
        Carregando…
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bg-surface border border-hairline-soft rounded-card p-10 text-center text-coral text-sm">
        {erro}
      </div>
    );
  }

  if (grupos.length === 0) {
    return (
      <div className="bg-surface border border-hairline-soft rounded-card p-10 text-center text-fg-muted text-sm">
        Nenhuma conta quitada para conciliar ainda.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {grupos.map(g => (
        <div key={g.data} className="bg-surface border border-hairline-soft rounded-card shadow-card overflow-hidden">
          <div className="flex items-center justify-between p-[14px_18px] border-b border-hairline-soft">
            <div className="text-fg-soft text-[13px] font-medium">
              {fmtData(g.data)}
              <span className="text-fg-faint font-normal text-[12.5px] ml-2">
                · {g.qtd} {g.qtd === 1 ? 'movimento' : 'movimentos'}
              </span>
            </div>
            <div className="flex items-center gap-4 font-mono text-[12.5px]">
              <span className="text-emerald2">+{fmtBRL(g.entradas)}</span>
              <span className="text-coral">−{fmtBRL(g.saidas)}</span>
              <span className={g.entradas - g.saidas >= 0 ? 'text-fg' : 'text-coral'}>
                = {fmtBRL(g.entradas - g.saidas)}
              </span>
            </div>
          </div>
          <div>
            {g.contas.map(c => (
              <div
                key={`${c.tipo}-${c.id}`}
                className="flex items-center gap-4 px-[18px] py-3 border-b border-hairline-soft last:border-b-0 text-[13px]"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${c.tipo === 'pagar' ? 'bg-coral' : 'bg-emerald2'}`} />
                <span className="flex-1 text-fg">{c.descricao}</span>
                <span className="text-fg-muted text-[12px] font-mono">{c.forma}</span>
                <span className={`font-mono ${c.tipo === 'pagar' ? 'text-coral' : 'text-emerald2'}`}>
                  {c.tipo === 'pagar' ? '−' : '+'}{fmtBRL(c.valor)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function KpiCardSimples({ label, value, foot, tone = 'iris' }) {
  const cor = {
    emerald: 'text-emerald2',
    coral:   'text-coral',
    iris:    'text-fg',
    amber:   'text-amber2',
  }[tone] || 'text-fg';
  return (
    <div className="bg-surface border border-hairline-soft rounded-card shadow-card p-[18px_20px]">
      <div className="text-[11px] uppercase tracking-[.14em] text-fg-muted font-medium mb-2">
        {label}
      </div>
      <div className={`font-mono text-[24px] font-medium tracking-[-0.02em] ${cor}`}>{value}</div>
      <div className="text-fg-faint text-xs mt-2">{foot}</div>
    </div>
  );
}

function ThSimple({ children, align = 'left', last }) {
  return (
    <th
      className="p-[10px_18px] font-medium text-[10.5px] uppercase tracking-[.14em] text-fg-faint border-y border-hairline-soft whitespace-nowrap"
      style={{ textAlign: align, paddingRight: last ? 18 : undefined }}
    >
      {children}
    </th>
  );
}
