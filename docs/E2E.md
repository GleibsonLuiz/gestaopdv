# Testes E2E (Playwright)

Fluxos de negócio reais — login, PDV, venda, caixa — rodando contra um ambiente
isolado e completo: backend próprio na porta **3335**, Vite na **5175** e banco
**demo_e2e** (database separado na mesma instância Neon, mesmo padrão do
`demo_manual` dos screenshots). Nada toca o dev (3333/5173) nem produção.

## Rodar

```bash
npm run e2e        # headless (relatório em playwright-report/)
npm run e2e:ui     # interface visual do Playwright (passo a passo)
npm run e2e:debug  # modo debug
```

Não precisa subir nada antes: o Playwright levanta backend e frontend sozinho
(`webServer` na config) e o **global-setup** prepara o banco a cada execução:

1. `prisma db push` cria/alinha o `demo_e2e` (em banco novo `migrate deploy`
   quebra — a migration fiscal de 2026-05-28 referencia um enum antes de
   criá-lo; por isso push).
2. `node prisma/seed.js` (idempotente — upserts; compras só na primeira vez).

A URL do banco é derivada de `backend/.env` trocando o database para
`demo_e2e`. Para apontar outro banco: `E2E_DATABASE_URL` (o nome **precisa**
conter "e2e" — trava de segurança, já que o setup roda
`db push --accept-data-loss` + seed).

## Estrutura

```
playwright.config.ts   # portas, webServers, global-setup
e2e/
├── env.ts             # URLs/portas + derivação segura do banco demo_e2e
├── global-setup.ts    # db push + seed (1x por execução)
├── fixtures.ts        # apiLogin, garantirCaixaAberto, contarVendas, loginUI
└── pdv.spec.ts        # os testes
```

## O que está coberto (4 testes)

| Teste | Valida |
|---|---|
| Venda completa no PDV | login UI → bipe 3 itens (código + Enter) → F10 (pagamento DINHEIRO) → F10 (confirma) → **venda persistida na API** |
| Senha errada | mensagem de erro e permanência na tela de login |
| Borda zod de /vendas | 6 payloads malformados → todos 400 |
| Borda zod de /caixas/abrir | saldo não numérico → 400 |

A asserção final da venda é **contra a API** (contagem de vendas), não contra
a UI — imune a mudança de layout.

## Detalhes do PDV que os testes dependem

- O app abre **direto no PDV em tela cheia**; o campo de bipe é
  `input[placeholder*="Bipe"]`.
- Código exato + Enter adiciona o item (códigos do seed: `PAP-0001`,
  `PAP-0007`, `PAP-0006`, com estoque vindo das compras do seed).
- `F10` abre o modal de pagamento já semeado com DINHEIRO no valor cheio;
  `F10` de novo confirma.
- Login do seed: `admin@gestaopro.local` / `admin123`.
- Sempre `127.0.0.1` (não `localhost`): o backend só escuta IPv4.

## Troubleshooting

- **"Chromium not found"** → `npx playwright install chromium`
- **Import falha com `@playwright/test`** → o pacote instalado é `playwright`
  (que embute o runner); importe de `"playwright/test"`.
- **Timeout no webServer do backend** → conferir `backend/.env`
  (DATABASE_URL/CRIPTO_SECRET) e se a porta 3335 está livre.
- **Banco recusado no setup** → o nome do database precisa conter "e2e".

## Próximos testes (backlog Fase 2)

1. Formas de pagamento além de DINHEIRO (PIX, crédito, múltiplas formas + troco)
2. Caixa: fechar com conferência, sangria e suprimento via UI
3. Venda por peso (KG) e etiqueta de balança
4. Modo Clean (F7) — venda completa no layout focado
