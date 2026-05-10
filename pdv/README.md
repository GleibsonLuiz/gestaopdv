# GestãoPRO — PDV Redesign

Tela de Ponto de Venda redesenhada — dark sofisticado, acento mint, fluxo de venda fluido com microanimações.

## Como rodar localmente

O projeto é HTML + JSX (Babel in-browser). Não precisa build, mas precisa servir via HTTP (não abrir o `.html` direto, senão os `script src` falham por CORS).

### Opção 1 — VSCode + Live Server (recomendado)

1. Abra a pasta no VSCode: `File → Open Folder…`
2. Instale a extensão **Live Server** (Ritwick Dey) na aba de extensões
3. Clique com o botão direito em `PDV.html` → **Open with Live Server**
4. Abre em `http://127.0.0.1:5500/PDV.html`

### Opção 2 — Python (já vem instalado em Mac/Linux)

```bash
cd pasta-do-projeto
python3 -m http.server 5500
```
Abra `http://localhost:5500/PDV.html`

### Opção 3 — Node

```bash
npx serve .
```
Abra a URL que aparecer no terminal + `/PDV.html`

## Estrutura

```
PDV.html              ← entrada (abra esse arquivo)
styles.css            ← tokens de design + todo o CSS
data.js               ← mock de produtos, vendas, usuário
components.jsx        ← Header, Dashboard, Icon, Money
cart.jsx              ← Scanner, Catálogo, Cestinha, Modal de pagamento
app.jsx               ← composição + estado + atalhos de teclado
tweaks-panel.jsx      ← painel de tweaks (cor, densidade, tema)
```

## Atalhos do PDV

| Tecla       | Ação                          |
|-------------|-------------------------------|
| `/`         | Focar campo de busca          |
| `Enter`     | Adicionar item bipado / confirmar |
| `Esc`       | Limpar busca / fechar modal   |
| `F1–F6`     | Selecionar forma de pagamento |
| `F8`        | Cancelar último item          |
| `F10`       | Finalizar venda               |

## Tweaks ao vivo

Ative o toggle **Tweaks** no toolbar pra:
- Mudar cor de destaque (mint, sky, violet, amber, rose, yellow)
- Alternar tema escuro/claro
- Densidade compacto/regular/espaçoso
- Layout do catálogo grade/lista
- Mostrar/esconder dashboard
- Popular o carrinho com itens de exemplo (pra testar o fluxo)

## Stack

- React 18 (UMD via unpkg)
- Babel Standalone (JSX in-browser, sem build)
- Geist + Geist Mono (Google Fonts)
- CSS puro com custom properties pra tema/densidade

## Migrar pra build moderno (Vite)

Se quiser virar um projeto Vite/Next:

```bash
npm create vite@latest pdv -- --template react
cd pdv
npm install
```

Depois copie:
- `styles.css` → `src/styles.css` (importe em `main.jsx`)
- `data.js` → `src/data.js` (mude `window.PDV_DATA = …` pra `export default …`)
- `components.jsx` / `cart.jsx` / `app.jsx` → quebre em arquivos separados em `src/components/`, troque `Object.assign(window, …)` por `export`/`import` ES modules
- Remova as tags `<script src="…">` do HTML — Vite cuida do bundling
