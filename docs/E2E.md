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

## O que está coberto (10 testes)

| Spec | Teste | Valida |
|---|---|---|
| caixa-ui | Fechar e reabrir pela tela Caixa | conferência cega → comprovante "Concluir" → reabertura com saldo novo |
| caixa | Ciclo via API | abrir → sangria → suprimento → extrato confere → fechar → atual null |
| caixa | Borda zod sangria | valor 0/negativo/não numérico → 400 |
| pdv | Venda completa DINHEIRO | login → bipe 3 itens → F10/F10 → **venda persistida na API** |
| pdv | Venda PIX pela UI | clique no card PIX (atalhos F1-F6 são dinâmicos!) → F10 |
| pdv | Modo Clean (F7) | venda completa no layout focado |
| pdv | Senha errada | erro visível, permanece no login |
| pdv | Borda zod /vendas | 6 payloads malformados → 400 |
| pdv | Multi-pagamento via API | DINHEIRO+PIX divididos, total conferido |
| pdv | Borda zod /caixas/abrir | saldo não numérico → 400 |

Asserções de venda/caixa são **contra a API**, não contra a UI — imunes a
mudança de layout.

## CI

O job **E2E (Playwright)** roda a suite em todo push/PR usando o secret
`TEST_DATABASE_URL` (aponta para o demo_e2e no Neon). Sem o secret (fork/PR
externo) o job vira no-op verde. Um `concurrency group` serializa execuções —
o banco de teste é um só. O job é informativo (fora dos required checks).
Em falha, o relatório HTML sobe como artifact `playwright-report`.

**Atenção:** rodar `npm run e2e` local **enquanto o job de CI executa** pode
interferir (mesmo banco). Espere o CI ou use `E2E_DATABASE_URL` próprio.

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

## Próximos testes (backlog)

1. Venda por peso (KG) e etiqueta de balança (exige produto unidade KG no seed)
2. Formas a prazo pela UI (crédito/crediário pedem vencimento/parcelas no modal)
