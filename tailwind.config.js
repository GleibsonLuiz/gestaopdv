/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Tokens do sistema de temas GestaoPRO. Mapeiam as CSS vars
        // definidas em src/lib/theme.ts (aplicadas em :root pelo aplicarTema).
        // Use estes tokens em telas migradas para Tailwind — eles reagem
        // automaticamente ao tema escolhido pelo usuario.
        'gp-bg':      'var(--bg)',
        'gp-surface': 'var(--surface)',
        'gp-card':    'var(--card)',
        'gp-border':  'var(--border)',
        'gp-accent':  'var(--accent)',
        'gp-purple':  'var(--purple)',
        'gp-green':   'var(--green)',
        'gp-red':     'var(--red)',
        'gp-yellow':  'var(--yellow)',
        'gp-text':    'var(--text)',
        'gp-muted':   'var(--muted)',
        'gp-white':   'var(--white)',
        // Tinta de texto sobre botoes primarios (gradiente accent->purple).
        // Calculada pelo tom MAIS CLARO do gradiente (inkDoAccent em theme.ts),
        // entao continua legivel em temas de accent claro (ouro, Grafite,
        // Alto Contraste) onde --white seria branco-no-branco. Use em botoes
        // de accent; --white/gp-white permanece para titulos/texto.
        'gp-accent-ink': 'var(--accent-ink)',
        ink: {
          950: '#0a0c14',
          900: '#0f1220',
          850: '#13172a',
          800: '#191e36',
          750: '#222848',
          700: '#2a3155',
        },
        line: {
          DEFAULT: '#2a304d',
          2: '#363d5e',
          3: '#444c72',
        },
        mist: {
          100: '#f5f6fb',
          200: '#d8dcef',
          300: '#a8aecc',
          400: '#7a82a8',
          500: '#5b6390',
        },
        brand: {
          violet: '#8b5cf6',
          indigo: '#6366f1',
          sky:    '#60a5fa',
          pink:   '#e879f9',
        },
        // tokens da tela Financeiro (resolvem variaveis CSS de tokens.css,
        // que existem apenas dentro de .financeiro-bg)
        bg:           'var(--bg)',
        surface:      'var(--surface)',
        'surface-2':  'var(--surface-2)',
        'surface-3':  'var(--surface-3)',
        hairline:     'var(--hairline)',
        'hairline-soft': 'var(--hairline-soft)',
        fg:           'var(--fg)',
        'fg-soft':    'var(--fg-soft)',
        'fg-muted':   'var(--fg-muted)',
        'fg-faint':   'var(--fg-faint)',
        'fg-dim':     'var(--fg-dim)',
        emerald2:     'var(--emerald)',
        amber2:       'var(--amber)',
        coral:        'var(--coral)',
        iris:         'var(--iris)',
        sky2:         'var(--sky)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      borderRadius: {
        card: '14px',
      },
      letterSpacing: {
        tightish: '-0.005em',
      },
      fontFamily: {
        sans:    ['Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'Helvetica Neue', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono:    ['"Geist Mono"', 'ui-monospace', '"JetBrains Mono"', 'monospace'],
        serif:   ['"Instrument Serif"', '"Times New Roman"', 'serif'],
      },
      animation: {
        'fade-up':    'fadeUp .55s cubic-bezier(.2,.7,.3,1) both',
        'mesh-1':     'mesh1 22s ease-in-out infinite',
        'mesh-2':     'mesh2 26s ease-in-out infinite',
        'mesh-3':     'mesh3 30s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        mesh1: {
          '0%, 100%': { transform: 'translate(0,0) scale(1)' },
          '50%':      { transform: 'translate(-4%, 5%) scale(1.08)' },
        },
        mesh2: {
          '0%, 100%': { transform: 'translate(0,0) scale(1.05)' },
          '50%':      { transform: 'translate(6%, -3%) scale(.95)' },
        },
        mesh3: {
          '0%, 100%': { transform: 'translate(0,0) scale(.9)' },
          '50%':      { transform: 'translate(-3%, -4%) scale(1.1)' },
        },
      },
    },
  },
  plugins: [],
  // O resto do projeto usa estilos inline e depende dos defaults do navegador.
  // Desabilitamos o Preflight para evitar regressao visual fora da tela de login.
  corePlugins: { preflight: false },
};
