# Plano de Hardening do Webhook Mercado Pago (M2/M3)

Rollout faseado para fechar os itens **M2** (rate-limit / amplificação cross-tenant)
e **M3** (validação de assinatura HMAC `x-signature`) levantados na auditoria de
resiliência do módulo MP Point. Cada fase é **independente, reversível e não-quebra**
o webhook em produção. Avance só quando o critério da fase anterior for atingido.

> Por que faseado e não um patch: os webhooks legítimos do MP chegam de poucos IPs
> da infra deles (rate-limit por IP estrangularia tráfego real), o MP **não permite
> headers customizados** na chamada de webhook (logo o `?secret=` na URL é necessário
> para rotear o tenant), e a assinatura HMAC usa um *signing secret por tenant*
> configurado no painel do MP — exige novo campo no schema + migration + tela.

## Estado atual (baseline)

`POST /pagamentos-mp/webhook` (rota pública, sem `authRequired`):

1. Extrai `type` + `paymentId` do query/body.
2. **Caminho com secret** (`?secret=<mpWebhookSecret>` ou header `x-webhook-secret`):
   resolve o tenant por igualdade em `ConfiguracaoEmpresa.mpWebhookSecret` (24 bytes
   aleatórios), decifra o token, processa. **1 lookup + 1 chamada MP.** É o caminho
   bom — as URLs geradas pela nossa UI (`obterConfig`) já embutem o secret.
3. **Caminho legado** (sem secret): varre **todas** as `ConfiguracaoEmpresa` ativas
   e chama `obterPayment` em cada uma até casar. **N chamadas MP por request** =
   vetor de amplificação para requests forjados.
4. Sempre responde 200 (exceto 401 com secret inválido).

**Lacunas:**
- Sem rate-limit na rota pública.
- Varredura cross-tenant no caminho legado (amplificação MP).
- Secret viaja na URL (vaza em access log / `Referer`) — hoje é a **única** prova
  de autenticidade.
- Sem validação `x-signature` (mecanismo oficial do MP, com anti-replay).

**Reframe importante:** quando o HMAC estiver ativo, o `?secret=` da URL passa a ser
apenas **roteamento** (descobrir o tenant sem varrer). Mesmo que a URL vaze, sem o
*signing secret* do MP o atacante não forja uma assinatura válida. As duas camadas
se complementam: secret roteia, HMAC autentica.

---

## Fase 0 — Pré-requisitos (sem deploy de código)

- [ ] Destravar `prisma generate` (parar o dev server que segura a DLL no Windows).
- [ ] Migration: adicionar `mpWebhookSignatureSecret String?` em `ConfiguracaoEmpresa`
      (cifrado, como o access token). Aplicar **manualmente no Neon** (topologia atual).
- [ ] Confirmar no painel de um tenant real o formato do header e o template do
      manifesto (ver Apêndice A).

**Risco:** nenhum (campo nullable, nada lê dele ainda). **Rollback:** trivial.

---

## Fase 1 — Coletar o signing secret (aditivo)

Objetivo: começar a **armazenar** o signing secret de cada tenant, sem validar nada.

- [ ] Backend `salvarConfig`: aceitar `mpWebhookSignatureSecret` (string|null),
      cifrar com `lib/cripto.js`, gravar. `obterConfig` retorna só mascarado.
- [ ] Frontend (Configurações > Maquininha): campo "Assinatura secreta (x-signature)"
      com instrução — copiar de **MP > Suas integrações > Webhooks > Assinatura secreta**.
- [ ] Webhook continua **idêntico** (ainda não valida).

**Risco:** nenhum (só persiste um campo). **Rollback:** ignorar o campo.
**Critério de avanço:** a maioria dos tenants ativos com maquininha preencheu o secret.

---

## Fase 2 — Validar HMAC em modo "log-only" (observabilidade)

Objetivo: medir, sem bloquear, se as assinaturas batem — pegar bugs de manifesto
**antes** de rejeitar tráfego real.

- [ ] Implementar `validarAssinaturaMp({ req, paymentId, signingSecret })`:
  - parse de `x-signature` → `ts`, `v1`.
  - manifesto: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
    (ver Apêndice A — `data.id` minúsculo; omitir partes ausentes).
  - HMAC-SHA256(signingSecret) → comparar com `v1` via `compararSegredo`
    (timing-safe, já existe em `lib/timingSafe.js`).
  - anti-replay: rejeitar se `|agora - ts|` > 5 min.
- [ ] No webhook, **após** resolver o tenant pelo `?secret=`: se o tenant tem
      `mpWebhookSignatureSecret`, validar e **apenas logar** `valido=true|false`
      (com `paymentId`, sem vazar o secret). Processar normalmente de qualquer jeito.

**Risco:** nenhum (não bloqueia). **Rollback:** remover o log.
**Critério de avanço:** ~100% de assinaturas válidas por alguns dias para os tenants
com secret configurado (descontados replays/testes).

---

## Fase 3 — Enforcement por tenant (opt-in gradual)

Objetivo: passar a **rejeitar** (401) assinatura inválida/ausente, mas só para tenants
que já têm signing secret e histórico limpo na Fase 2.

- [ ] Regra: se `mpWebhookSignatureSecret` presente → assinatura é **obrigatória**
      (inválida/ausente = 401, sem chamar a API do MP).
- [ ] Tenants **sem** secret continuam no fluxo atual (não quebra).
- [ ] Métrica/alerta de 401 por tenant para detectar regressão de config.

**Risco:** médio — uma config errada de um tenant derruba os webhooks **dele**
(não dos outros). Mitigado pela Fase 2. **Rollback:** flag para voltar a log-only.
**Critério de avanço:** todos os tenants ativos com maquininha têm secret + 0 falsos 401.

---

## Fase 4 — Hardening do caminho legado + rate-limit (M2)

Objetivo: matar a amplificação cross-tenant e limitar abuso **sem** tocar no tráfego
legítimo do MP (que cai no caminho com secret).

- [ ] Rate-limit **DB-backed** (reusar o padrão de `rateLimitLogin.js` /
      tabela `login_throttle`, ou tabela análoga) aplicado **somente ao caminho
      legado sem secret** — o caro. O caminho com secret NÃO é limitado.
- [ ] Garantir que toda URL ativa no painel do MP foi (re)registrada com `?secret=`
      (gerar relatório de tenants cujo último webhook chegou sem secret).
- [ ] Depois que ninguém legítimo depende mais da varredura: **remover** o fallback
      cross-tenant (responder 200 `ignored` quando não há secret nem `user_id`).

**Risco:** médio — remover a varredura quebra qualquer registro antigo sem secret.
Por isso o passo de inventário/migração de URLs vem antes. **Rollback:** reativar
a varredura (manter atrás de flag por 1–2 ciclos).

---

## Fase 5 — Limpeza / estado-alvo

- [ ] HMAC **obrigatório** para todo tenant com maquininha ativa (signing secret
      passa a ser exigido junto com o access token na ativação).
- [ ] Varredura cross-tenant removida de vez.
- [ ] (Opcional) rotacionar `mpWebhookSecret` e re-registrar URLs, agora que o
      secret da URL é só roteamento.
- [ ] Atualizar `docs/MANUAL.md` (passo de copiar a assinatura secreta) e a memória
      `project_pagamento_mp_point.md`.

---

## Resumo de risco por fase

| Fase | O que muda | Risco | Quebra produção? |
|------|------------|-------|------------------|
| 0 | migration campo nullable | nenhum | não |
| 1 | salva signing secret | nenhum | não |
| 2 | valida em log-only | nenhum | não |
| 3 | enforce por tenant (opt-in) | médio (isolado por tenant) | só tenant mal-configurado |
| 4 | rate-limit legado + remove varredura | médio | só registros antigos sem secret |
| 5 | HMAC obrigatório + limpeza | baixo (já validado nas fases) | não |

---

## Apêndice A — Formato do `x-signature` do Mercado Pago

Headers enviados pelo MP na notificação:

```
x-signature: ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8eda45a0282ff693eac24131a5e839
x-request-id: <uuid>
```

Manifesto a assinar (HMAC-SHA256 com a *assinatura secreta* do painel do MP):

```
id:<data.id_em_minusculo>;request-id:<x-request-id>;ts:<ts>;
```

- `data.id` = valor de `?data.id=` (ou `data.id` do body). Se a doc do país pedir
  minúsculo, normalizar.
- Omitir os componentes (`id:`, `request-id:`) que não vierem na requisição,
  mantendo a ordem e os `;`.
- Comparar o HMAC hex resultante com `v1` em tempo constante.
- Validar a janela do `ts` (anti-replay): rejeitar se muito antigo/futuro (~5 min).

> Validar contra a doc viva do MP no momento da implementação (skill `mp-webhooks`
> tem o padrão de referência), pois o template do manifesto pode variar por produto/país.

## Arquivos afetados (referência)

- `backend/prisma/schema.prisma` — campo `mpWebhookSignatureSecret`.
- `backend/src/controllers/pagamentoMpController.js` — `salvarConfig`, `obterConfig`,
  `webhook` (validação + enforcement + rate-limit do caminho legado).
- `backend/src/lib/timingSafe.js` — reuso de `compararSegredo` (já existe).
- `backend/src/middlewares/` — middleware de rate-limit do webhook (novo, padrão
  `rateLimitLogin`).
- Frontend `Configuracoes`/maquininha — campo da assinatura secreta.
