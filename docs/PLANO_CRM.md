# Plano de Atualização — CRM de Vendas (GestãoPRO)

> **Criado em:** 31/maio/2026
> **Base:** análise do sistema atual (52 modelos Prisma, 47 controllers, ~45 telas) + benchmark dos líderes de mercado (Salesforce, HubSpot, Pipedrive, Kommo, RD Station, Ploomes, Outreach/Salesloft/Apollo).
> **Objetivo:** fechar as lacunas específicas que separam o GestãoPRO dos melhores CRMs de vendas de 2025/2026 — foco em **IA**, **engajamento multicanal (cadências)** e **captação de leads**.

---

## 1. Diagnóstico — onde já estamos (e estamos bem)

O sistema já é, em CRM, mais completo que muito SaaS pago.

| Capacidade | GestãoPRO hoje | Líderes |
|---|---|---|
| Funil Kanban drag-drop | ✅ `Funil.tsx` (6 etapas, motivo de perda) | ✅ |
| Segmentação RFM + lead score | ✅ `Segmentos.tsx` (score 0-100) | ✅ (com IA) |
| Pós-venda NPS | ✅ rota pública + dashboard | Parcial (add-on) |
| Automações por gatilho | ✅ 3 tipos via cron | ✅ (visuais/ramificadas) |
| Tarefas / cadência básica | ✅ `Tarefas.tsx` | ✅ |
| Fidelidade + Comissões | ✅ | Raro nos genéricos |
| Customer data (B2B, tags, interações) | ✅ `Contato`/`Interacao`/`Tag` | ✅ |
| WhatsApp + IA | ✅ Evolution API + Claude bot | ✅ (Kommo/RD se destacam) |
| Dashboard CRM + 7 relatórios | ✅ `dashboardCrmController` | ✅ |

**Conclusão:** não é preciso "construir um CRM" — e sim **fechar 8 lacunas** e migrar o foco de "ter recursos" para **inteligência, engajamento e captação**.

---

## 2. Lacunas vs. os melhores (priorizadas)

1. **IA aplicada a vendas** — score atual é só RFM (regras). Líderes usam IA preditiva (40-60% de acerto), *deal health score*, *next-best-action* e resumo de conversa. **Claude já está integrado** no WhatsApp — falta levar ao funil/cliente.
2. **Cadências/sequências multicanal** — hoje as automações criam *uma* tarefa por gatilho. Falta sequência de N passos (dia 0 WhatsApp → dia 3 ligação → dia 7 e-mail) com ramificação por engajamento (coração de Outreach/Salesloft/Apollo).
3. **Captação de leads (inbound)** — leads são 100% manuais. Falta formulário público + link de bio Instagram + lead via WhatsApp caindo direto no funil.
4. **Timeline unificada (Customer 360)** — abas separadas existem, mas falta um *feed cronológico único* (venda, orçamento, NPS, oportunidade, pontos, mensagem).
5. **Metas/quotas + pacing + ranking gamificado** — há Comissões, mas não meta por vendedor com barra de atingimento e leaderboard.
6. **Funil ponderado + múltiplos funis + estágios customizáveis** — 6 etapas fixas no enum. Falta probabilidade por etapa (forecast ponderado) e funis por tipo de negócio.
7. **Aceite online de orçamento + assinatura** — orçamento vai por texto. Falta página pública de aceite/recusa (padrão já existe em `PesquisaPublicaNps`).
8. **Construtor visual de automações / campos customizados / API-webhooks** — extensibilidade (médio prazo).

---

## 3. Plano faseado

### 🟢 Fase 1 — Quick wins (alto valor, baixo risco) · ~2-3 semanas
Reaproveita dados/infra existentes, **sem integração externa nova**.

- **1.1 Timeline unificada do cliente** — agregar venda + orçamento + oportunidade + interação + tarefa + NPS + pontos num feed cronológico em `PerfilClienteModal.tsx`. Novo endpoint em `clienteController.js`. *Sem migração.*
- **1.2 Funil ponderado** — add `probabilidade Int?` em `Oportunidade` (migração simples) + valor ponderado e forecast em `Funil.tsx` / `dashboardCrmController`.
- **1.3 Aceite online de orçamento** — clonar padrão `PesquisaPublicaNps.tsx`/rota pública: token no `Orcamento`, página `?orc=<token>` com Aceitar/Recusar → notifica vendedor + move funil. Forte para B2B.
- **1.4 Metas de vendas + pacing + ranking** — novo modelo `Meta` (vendedor, mês, valor); tela reaproveitando `RelatorioComissoes.tsx` / `DashboardCrm.tsx` com barra de atingimento e leaderboard.

### 🟡 Fase 2 — Engajamento & captação (diferencial Brasil) · ~4-6 semanas

- **2.1 Cadências/sequências** — evoluir `RegraAutomacao`: novos `Cadencia` + `CadenciaPasso` (dia, canal, template) executados pelo `cron.js` existente. Aproveita `TemplateMensagem` e `WhatsappLog`.
- **2.2 WhatsApp como inbox/qualificação** — Evolution API + webhook + bot Claude já existem. Falta: vincular conversa ao cliente/oportunidade, criar lead automático de mensagem nova, qualificação por bot (FAQ → captura nome/interesse → cria Lead no funil).
- **2.3 Captação de leads** — formulário público (mesmo padrão de rota pública) + link de bio → cria `Cliente` (Lead) e entra em cadência automaticamente.

### 🔵 Fase 3 — Camada de IA (Vercel AI Gateway / Claude) · contínua, em paralelo
Custo de entrada já pago (Claude no WhatsApp).

- **3.1 Resumo + próximo passo** — botão "✨ Resumir" no perfil do cliente/oportunidade que lê interações e sugere a próxima ação.
- **3.2 Score preditivo** — complementar o RFM com sinais (frequência de contato, estágios, tempo parado) → "saúde do negócio".
- **3.3 Redação assistida** — gerar mensagem de WhatsApp/e-mail com merge fields a partir do contexto do cliente.
- **3.4 Alerta de deal parado/risco de churn** — *deal stalled >28 dias = 67% menos conversão*; agir em 72h reduz a perda pela metade.
- **Infra:** usar **Vercel AI Gateway** com strings `"provider/model"` (failover, observabilidade) em vez de SDK direto.

### ⚪ Fase 4 — Plataforma & extensibilidade · médio prazo
- Funis múltiplos + estágios e campos customizáveis (sair do enum fixo → tabela `EtapaFunil`).
- Construtor visual de automações (ramificação if/then, delays, multicanal — estilo Salesloft drag-drop).
- Agendador de reuniões / link de booking.
- API pública + webhooks (já há `LogAuditoria` e infra de cron).

---

## 4. Sequência recomendada

**Fase 1** (entrega percebida imediata, zero dependência externa) → **Fase 3.1/3.4 em paralelo** (Claude já plugado, "fruta baixa" de IA) → **Fase 2** (cadências + captação = maior salto competitivo no Brasil, onde Kommo/RD ganham). **Fase 4** só com demanda de clientes maiores.

---

## 5. Cuidados transversais (do projeto)

- 📘 **Atualizar `docs/MANUAL.md`** (e `Ajuda.tsx` se nova tela) a cada feature — regra do projeto.
- 🗄️ **Migrações Neon aplicadas manualmente** + dois projetos Vercel (deploy auto no `push main`).
- 🔄 **Cache PWA**: feature nova "não aparecer" = suspeitar do service worker.
- 🔒 **LGPD/multi-tenant**: captação de leads e IA precisam respeitar isolamento por tenant e consentimento.

---

## Fontes (benchmark)

- Salesforce/HubSpot/Pipedrive — https://www.sybill.ai/blogs/salesforce-vs-hubspot-vs-pipedrive
- AI CRM / lead scoring — https://www.coffee.ai/articles/ai-crm-predictive-lead-scoring/
- Salesforce Einstein — https://www.salesforce.com/eu/blog/predictive-lead-scoring-ai-sales-marketing/
- Sales engagement / cadências — https://surferstack.com/guides/sales-engagement-platforms-compared-salesloft-vs-apollo-io-vs-outreach-in-2026
- CRM Brasil (Kommo/RD/Ploomes) — https://cromosit.com.br/crm-no-brasil-os-principais-players-tendencias-e-o-dominio-da-ploomes-na-america-latina/
- Kommo vs RD (Capterra BR) — https://www.capterra.com.br/compare/120048/180098/amocrm/vs/rd-station
- WhatsApp Business API 2025/26 — https://www.messagecentral.com/blog/whatsapp-business-api-complete-guide
- HubSpot WhatsApp CRM — https://www.hubspot.com/products/whatsapp-integration
- Customer 360 (Freshsales) — https://freshworks.com/crm/sales/what-is-customer-360
