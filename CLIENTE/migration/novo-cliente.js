/* Tela Novo Cliente — máscaras, validação, ViaCEP, persistência de rascunho */
(() => {
  const $ = (q, r = document) => r.querySelector(q);

  const form      = $('#form');
  const bar       = $('#bar');
  const pct       = $('#pct');
  const obs       = $('#obs');
  const obsCount  = $('#obs-count');
  const cep       = $('#cep');
  const cepStatus = $('#cep-status');

  // ---------- Máscaras ----------
  const onlyDigits = v => (v || '').replace(/\D+/g, '');

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

  function attachMask(el, fn) {
    el.addEventListener('input', () => {
      const start = el.selectionStart;
      const before = el.value.length;
      el.value = fn(el.value);
      const after = el.value.length;
      try { el.setSelectionRange(start + (after - before), start + (after - before)); } catch (_) {}
    });
  }

  attachMask($('#doc'), maskDoc);
  attachMask($('#telefone'), maskPhone);
  attachMask(cep, maskCep);

  // ---------- Validação ----------
  const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const isCPF   = v => onlyDigits(v).length === 11;
  const isCNPJ  = v => onlyDigits(v).length === 14;

  const rules = {
    nome:     v => v.trim().length >= 2 || 'Informe o nome completo',
    doc:      v => isCPF(v) || isCNPJ(v) || 'Documento incompleto',
    telefone: v => !v || onlyDigits(v).length >= 10 || 'Telefone incompleto',
    email:    v => isEmail(v.trim()) || 'E-mail inválido',
    cep:      v => !v || onlyDigits(v).length === 8 || 'CEP incompleto',
  };

  function validateField(id) {
    const el = document.getElementById(id);
    if (!el) return true;
    const msgEl = document.querySelector(`.error[data-for="${id}"]`);
    const rule = rules[id];
    if (!rule) return true;
    const result = rule(el.value);
    if (result === true) {
      el.removeAttribute('aria-invalid');
      if (el.value.trim()) el.dataset.state = 'valid'; else delete el.dataset.state;
      if (msgEl) msgEl.textContent = '';
      return true;
    }
    el.setAttribute('aria-invalid', 'true');
    delete el.dataset.state;
    if (msgEl) msgEl.textContent = result;
    return false;
  }

  Object.keys(rules).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('blur', () => validateField(id));
    el.addEventListener('input', () => {
      if (el.getAttribute('aria-invalid') === 'true') validateField(id);
      updateProgress();
    });
  });

  // ---------- Progresso ----------
  const tracked = ['nome', 'doc', 'email', 'telefone', 'cep', 'endereco', 'numero', 'cidade', 'estado', 'obs'];
  function updateProgress() {
    let filled = 0;
    tracked.forEach(id => {
      const el = document.getElementById(id);
      if (el && String(el.value).trim().length > 0) filled++;
    });
    const p = Math.round((filled / tracked.length) * 100);
    bar.style.width = p + '%';
    pct.textContent = p + '%';
  }

  // ---------- Contador obs ----------
  obs.addEventListener('input', () => { obsCount.textContent = String(obs.value.length); updateProgress(); });

  // ---------- ViaCEP autofill ----------
  cep.addEventListener('blur', async () => {
    const d = onlyDigits(cep.value);
    if (d.length !== 8) return;
    cepStatus.textContent = 'Buscando…';
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { mode: 'cors' });
      if (!r.ok) throw new Error();
      const j = await r.json();
      if (j.erro) { cepStatus.textContent = 'Não encontrado'; return; }
      if (!$('#endereco').value) $('#endereco').value = j.logradouro || '';
      if (!$('#cidade').value)   $('#cidade').value   = j.localidade || '';
      if (!$('#estado').value)   $('#estado').value   = j.uf || '';
      cepStatus.textContent = 'Preenchido';
      setTimeout(() => cepStatus.textContent = '', 1800);
      updateProgress();
    } catch (_) {
      cepStatus.textContent = '';
    }
  });

  // ---------- Persistência (localStorage) ----------
  const KEY = 'novo-cliente:draft';
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) {
      Object.entries(saved).forEach(([k, v]) => {
        const el = document.getElementById(k);
        if (el && v != null) el.value = v;
      });
      obsCount.textContent = String(($('#obs').value || '').length);
    }
  } catch (_) {}

  form.addEventListener('input', () => {
    const data = {};
    new FormData(form).forEach((v, k) => data[k] = v);
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) {}
  });

  // ---------- Cancelar / submeter ----------
  $('#cancel').addEventListener('click', () => {
    if (form.checkValidity?.() && !confirm('Descartar este cadastro?')) return;
    form.reset();
    try { localStorage.removeItem(KEY); } catch (_) {}
    updateProgress();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = ['nome', 'doc', 'email', 'telefone', 'cep'].every(validateField);
    if (!ok) {
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    const btn = $('#submit');
    btn.disabled = true;
    btn.innerHTML = '<span>Criando…</span>';
    setTimeout(() => {
      btn.innerHTML = '<span>Cliente criado ✓</span>';
      try { localStorage.removeItem(KEY); } catch (_) {}
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<span>Criar cliente</span><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      }, 1400);
    }, 700);
  });

  // ---------- Teclado ----------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $('#cancel').click();
  });

  updateProgress();
})();
