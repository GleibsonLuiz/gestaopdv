# Migração — Tela "Novo Cliente"

Pasta pronta pra copiar pro seu projeto no VSCode (e iterar com Claude Code).
Tudo aqui é **standalone**: zero dependência de framework no HTML, e a versão React usa só `react` (sem libs de UI).

## O que tem aqui

```
migration/
├── README.md             ← este arquivo
├── tokens.css            ← variáveis de design (cores, fontes, raio, sombras)
├── novo-cliente.html     ← versão vanilla (HTML + CSS + JS puro)
├── novo-cliente.css      ← estilos extraídos do HTML acima
├── novo-cliente.js       ← lógica (máscaras, validação, ViaCEP, persistência)
└── NovoCliente.jsx       ← versão React (componente único, hooks)
```

## Como usar (3 caminhos)

### 1. Projeto HTML estático / vanilla

Copie `tokens.css`, `novo-cliente.css`, `novo-cliente.js` e `novo-cliente.html` pra raiz
(ou `public/`) do seu projeto. Os caminhos em `novo-cliente.html` já são relativos.

### 2. Projeto React (Vite, Next.js, CRA, etc.)

1. Copie `NovoCliente.jsx` pra `src/components/NovoCliente.jsx`
2. Copie `tokens.css` pra `src/styles/tokens.css`
3. Copie `novo-cliente.css` pra `src/components/NovoCliente.css`
4. No seu entry-point (`main.jsx` / `_app.tsx` / `layout.tsx`):

   ```js
   import './styles/tokens.css';
   ```

5. No componente que vai usar:

   ```jsx
   import NovoCliente from './components/NovoCliente';

   export default function Page() {
     return (
       <NovoCliente
         onSubmit={(data) => console.log('cliente:', data)}
         onCancel={() => history.back()}
       />
     );
   }
   ```

### 3. Projeto Next.js (App Router)

Mesmo passo 2, com dois detalhes:

- O componente é **client**. Adicione `"use client";` no topo de `NovoCliente.jsx`.
- `tokens.css` deve ser importado em `app/layout.tsx` (componente raiz).

## Prompt sugerido pro Claude Code (no seu VSCode)

Cole isto na primeira mensagem ao Claude Code dentro do seu projeto:

> Integre o componente `NovoCliente` (em `src/components/NovoCliente.jsx`) na rota
> `/clientes/novo` do meu app. O componente é controlado por props: `onSubmit(data)`
> e `onCancel()`. Ligue `onSubmit` ao meu endpoint POST `/api/clientes` e, em caso de
> sucesso, redirecione pra `/clientes/:id`. Mantenha o design tal como está — paleta
> e tipografia ficam em `src/styles/tokens.css`, não sobrescreva.

## Design tokens (resumo)

| Token            | Valor                              | Uso                          |
|------------------|------------------------------------|------------------------------|
| `--bg`           | `oklch(17% 0.028 252)`             | fundo da página              |
| `--surface`      | `oklch(23% 0.030 252)`             | cards / modal                |
| `--field`        | `oklch(21% 0.028 252)`             | inputs                       |
| `--fg`           | `oklch(97% 0.008 85)`              | texto principal              |
| `--muted`        | `oklch(70% 0.018 245)`             | texto secundário             |
| `--border`       | `oklch(33% 0.024 252)`             | hairlines                    |
| `--accent`       | `oklch(82% 0.115 88)` (champagne)  | CTA, link, foco              |
| `--accent-2`     | `oklch(74% 0.135 78)` (gold)       | gradiente do botão primário  |
| `--font-display` | Cormorant Garamond → serif         | título do modal              |
| `--font-body`    | Inter → system-ui                  | corpo, labels, inputs        |

## Acessibilidade

- Labels associadas via `for`/`id` em todos os campos
- `aria-invalid` no input quando a validação falha
- `prefers-reduced-motion` desliga transições
- Foco visível com `box-shadow` (ring champagne), nunca só `outline:none`
- `Enter` envia, `Esc` cancela

## O que NÃO está incluído (de propósito)

- Validação de dígito verificador de CPF/CNPJ — só checa **comprimento**. Adicione
  uma lib (`@brazilian-utils/brazilian-utils`) se precisar de validação real.
- Submit pra backend — `onSubmit` recebe os dados e você pluga onde quiser.
- i18n — todas as strings estão em pt-BR no markup. Extraia se for internacionalizar.
