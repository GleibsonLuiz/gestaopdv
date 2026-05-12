// Para Next.js App Router, descomente a linha abaixo:
// "use client";

import { useEffect, useRef, useState } from 'react';
import './NovoCliente.css'; // copie novo-cliente.css aqui (mesma pasta)

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

const onlyDigits = (v = '') => v.replace(/\D+/g, '');

function maskDoc(v) {
  const d = onlyDigits(v).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}
function maskPhone(v) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}
function maskCep(v) {
  return onlyDigits(v).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
}

const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const isCPF   = v => onlyDigits(v).length === 11;
const isCNPJ  = v => onlyDigits(v).length === 14;

const RULES = {
  nome:     v => v.trim().length >= 2 || 'Informe o nome completo',
  doc:      v => isCPF(v) || isCNPJ(v) || 'Documento incompleto',
  telefone: v => !v || onlyDigits(v).length >= 10 || 'Telefone incompleto',
  email:    v => isEmail(v.trim()) || 'E-mail inválido',
  cep:      v => !v || onlyDigits(v).length === 8 || 'CEP incompleto',
};

const STORAGE_KEY = 'novo-cliente:draft';

const EMPTY = {
  nome: '', doc: '', telefone: '', email: '',
  cep: '', estado: '', endereco: '',
  cidade: '', numero: '', complemento: '',
  obs: '',
};

const TRACKED = Object.keys(EMPTY);

export default function NovoCliente({ onSubmit, onCancel } = {}) {
  const [data, setData] = useState(() => {
    if (typeof window === 'undefined') return EMPTY;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return saved ? { ...EMPTY, ...saved } : EMPTY;
    } catch { return EMPTY; }
  });
  const [errors, setErrors] = useState({});
  const [cepStatus, setCepStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const firstInvalidRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  }, [data]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') handleCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filledCount = TRACKED.reduce((n, k) => n + (String(data[k] || '').trim() ? 1 : 0), 0);
  const progressPct = Math.round((filledCount / TRACKED.length) * 100);

  function setField(name, raw) {
    let value = raw;
    if (name === 'doc')       value = maskDoc(raw);
    else if (name === 'telefone') value = maskPhone(raw);
    else if (name === 'cep')      value = maskCep(raw);
    setData(d => ({ ...d, [name]: value }));
    if (errors[name]) {
      const r = RULES[name];
      if (r) {
        const res = r(value);
        setErrors(e => ({ ...e, [name]: res === true ? undefined : res }));
      }
    }
  }

  function validateField(name) {
    const rule = RULES[name];
    if (!rule) return true;
    const res = rule(data[name] || '');
    setErrors(e => ({ ...e, [name]: res === true ? undefined : res }));
    return res === true;
  }

  async function handleCepBlur() {
    validateField('cep');
    const d = onlyDigits(data.cep);
    if (d.length !== 8) return;
    setCepStatus('Buscando…');
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      if (!r.ok) throw new Error();
      const j = await r.json();
      if (j.erro) { setCepStatus('Não encontrado'); return; }
      setData(prev => ({
        ...prev,
        endereco: prev.endereco || j.logradouro || '',
        cidade:   prev.cidade   || j.localidade || '',
        estado:   prev.estado   || j.uf || '',
      }));
      setCepStatus('Preenchido');
      setTimeout(() => setCepStatus(''), 1800);
    } catch {
      setCepStatus('');
    }
  }

  function handleCancel() {
    if (filledCount > 0 && !window.confirm('Descartar este cadastro?')) return;
    setData(EMPTY);
    setErrors({});
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    onCancel?.();
  }

  function handleSubmit(e) {
    e.preventDefault();
    const required = ['nome', 'doc', 'email', 'telefone', 'cep'];
    let firstBad = null;
    const newErrors = {};
    required.forEach(k => {
      const rule = RULES[k];
      const res = rule(data[k] || '');
      if (res !== true) {
        newErrors[k] = res;
        if (!firstBad) firstBad = k;
      }
    });
    setErrors(newErrors);
    if (firstBad) {
      document.getElementById(firstBad)?.focus();
      return;
    }
    setSubmitting(true);
    Promise.resolve(onSubmit?.(data)).then(() => {
      setSubmitting(false);
      setSubmitted(true);
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      setTimeout(() => setSubmitted(false), 1600);
    }).catch(() => setSubmitting(false));
  }

  const inputProps = (name) => ({
    id: name,
    name,
    value: data[name] || '',
    onChange: (e) => setField(name, e.target.value),
    onBlur: () => validateField(name),
    'aria-invalid': errors[name] ? 'true' : undefined,
    'data-state': !errors[name] && String(data[name] || '').trim() ? 'valid' : undefined,
  });

  return (
    <main className="stage">
      <div className="eyebrow">
        <span className="dot" aria-hidden="true" />
        <span>Painel · Cadastro</span>
        <span className="grow" />
        <span>nº 0428</span>
      </div>

      <section className="card" role="dialog" aria-labelledby="title" aria-modal="false">
        <header className="card__head">
          <div>
            <h1 id="title" className="title">Novo <em>Cliente</em></h1>
            <p className="subtitle">
              Cadastre um cliente em sua carteira. Campos marcados com{' '}
              <span style={{ color: 'var(--accent)' }}>•</span> são obrigatórios.
            </p>
          </div>
          <button type="button" className="close" aria-label="Fechar" onClick={handleCancel}>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </header>

        <div className="progress" aria-hidden="true">
          <span>Preenchimento</span>
          <span className="bar"><i style={{ width: `${progressPct}%` }} /></span>
          <span className="pct">{progressPct}%</span>
        </div>

        <form onSubmit={handleSubmit} noValidate autoComplete="on">
          <fieldset>
            <legend>Identificação</legend>

            <div className="field">
              <label htmlFor="nome">Nome completo <span className="req" aria-hidden="true">•</span></label>
              <input className="input" type="text" placeholder="Ex.: Helena Aparecida Martins" required autoComplete="name" {...inputProps('nome')} />
              <span className="error">{errors.nome}</span>
            </div>

            <div className="row">
              <div className="field">
                <label htmlFor="doc">CPF / CNPJ <span className="req" aria-hidden="true">•</span></label>
                <input className="input" type="text" inputMode="numeric" placeholder="000.000.000-00" maxLength={18} required {...inputProps('doc')} />
                <span className="error">{errors.doc}</span>
              </div>
              <div className="field">
                <label htmlFor="telefone">Telefone</label>
                <input className="input" type="tel" inputMode="numeric" placeholder="(11) 99999-0000" maxLength={15} autoComplete="tel" {...inputProps('telefone')} />
                <span className="error">{errors.telefone}</span>
              </div>
            </div>

            <div className="field">
              <label htmlFor="email">E-mail <span className="req" aria-hidden="true">•</span></label>
              <input className="input" type="email" placeholder="helena@empresa.com.br" required autoComplete="email" {...inputProps('email')} />
              <span className="error">{errors.email}</span>
            </div>
          </fieldset>

          <fieldset>
            <legend>Endereço</legend>

            <div className="row">
              <div className="field">
                <label htmlFor="cep">CEP</label>
                <span className="hint">{cepStatus}</span>
                <input
                  className="input"
                  type="text" inputMode="numeric" placeholder="00000-000" maxLength={9} autoComplete="postal-code"
                  {...inputProps('cep')}
                  onBlur={handleCepBlur}
                />
                <span className="error">{errors.cep}</span>
              </div>
              <div className="field">
                <label htmlFor="estado">Estado</label>
                <select className="select" autoComplete="address-level1" {...inputProps('estado')}>
                  <option value="">Selecione…</option>
                  {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="endereco">Logradouro</label>
              <input className="input" type="text" placeholder="Rua, avenida ou alameda" autoComplete="street-address" {...inputProps('endereco')} />
            </div>

            <div className="row three">
              <div className="field">
                <label htmlFor="cidade">Cidade</label>
                <input className="input" type="text" placeholder="São Paulo" autoComplete="address-level2" {...inputProps('cidade')} />
              </div>
              <div className="field">
                <label htmlFor="numero">Número</label>
                <input className="input" type="text" inputMode="numeric" placeholder="123" {...inputProps('numero')} />
              </div>
              <div className="field">
                <label htmlFor="complemento">Complemento</label>
                <input className="input" type="text" placeholder="Apto, sala, bloco" {...inputProps('complemento')} />
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>Observações</legend>
            <div className="field">
              <label htmlFor="obs">Notas internas</label>
              <span className="hint">{(data.obs || '').length} / 500</span>
              <textarea className="textarea" maxLength={500} placeholder="Preferências de contato, segmento, histórico relevante…" {...inputProps('obs')} />
            </div>
          </fieldset>

          <footer className="foot">
            <span className="foot__note">
              <span className="key">⏎</span>
              Enviar com Enter · <span className="key">Esc</span> cancelar
            </span>
            <div className="actions">
              <button type="button" className="btn btn--ghost" onClick={handleCancel}>Cancelar</button>
              <button type="submit" className="btn btn--primary" disabled={submitting}>
                <span>{submitted ? 'Cliente criado ✓' : submitting ? 'Criando…' : 'Criar cliente'}</span>
                {!submitting && !submitted && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            </div>
          </footer>
        </form>
      </section>

      <div className="meta">
        <span className="save"><i aria-hidden="true" /> Rascunho salvo automaticamente</span>
        <span>ENC · v1.4</span>
      </div>
    </main>
  );
}
