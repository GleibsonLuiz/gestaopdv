# GestãoPRO — Catálogo de Funcionalidades

> **Status:** documento-base para o manual do usuário final. Cada módulo descreve **o que faz**, **para que serve** e **como usar**.
> **Versão de referência:** 26/maio/2026
> **Stack:** React 19 + Vite (front) · Node + Express + Prisma + PostgreSQL (back) · Tailwind + estilos inline com 6 temas claros/escuros.

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Como entrar no sistema](#2-como-entrar-no-sistema)
3. [Perfis de acesso (papéis)](#3-perfis-de-acesso-papéis)
4. [Estrutura da tela](#4-estrutura-da-tela)
5. [Módulos por seção da sidebar](#5-módulos-por-seção-da-sidebar)
   - 5.1 [Operação](#51-operação)
   - 5.2 [Cadastros](#52-cadastros)
   - 5.3 [Estoque](#53-estoque)
   - 5.4 [Vendas & CRM](#54-vendas--crm)
   - 5.5 [Financeiro](#55-financeiro)
   - 5.6 [Atendimento](#56-atendimento)
   - 5.7 [Sistema](#57-sistema)
6. [Resiliência a falhas de rede](#6-resiliência-a-falhas-de-rede)
7. [Atalhos de teclado](#7-atalhos-de-teclado)
8. [Termos do sistema (glossário)](#8-termos-do-sistema-glossário)
9. [Operações no celular](#9-operações-no-celular)
10. [Planos e limites](#10-planos-e-limites)
11. [Perguntas frequentes](#11-perguntas-frequentes)
12. [Como usar a Ajuda no sistema](#12-como-usar-a-ajuda-no-sistema)

---

## 1. Visão geral

**GestãoPRO** é um sistema completo de gestão empresarial para micro e pequenas empresas, desenhado originalmente para uma **papelaria/copiadora** (Maxcollor Gráfica Rápida e Copiadora) mas genérico o suficiente para qualquer comércio que precise de:

- **PDV (frente de caixa)** com leitor de código de barras, controle de caixa físico e cupom;
- **Cadastros completos** de clientes (CRM), fornecedores e produtos (com tributação NF-e ready);
- **Estoque** com entradas, saídas, ajustes, inventários cíclicos e movimentações automáticas;
- **Financeiro** com contas a pagar/receber, recorrência, parcelamento e anexos de boletos;
- **CRM profissional**: funil de vendas Kanban, segmentação RFM, NPS, automações, fidelidade e lead scoring;
- **Relatórios** com exportação em PDF para todos os módulos;
- **Multi-tenant**: cada empresa opera num espaço isolado, com plano, limites e expiração próprios;
- **Multi-canal**: comandas (mesa/viagem/delivery), atendimento WhatsApp, PDV volante para garçom.

O sistema é uma **PWA** (instalável no celular) com fallback offline limitado: o carrinho do PDV é persistido localmente; vendas exigem servidor online para finalizar.

---

## 2. Como entrar no sistema

1. Abra o sistema no navegador (ou no atalho da área de trabalho/celular).
2. Digite seu **e-mail** e **senha**.
3. Se for o **primeiro acesso** com senha temporária, o sistema vai pedir uma nova senha imediatamente (modal "Trocar senha").
4. Após 5 tentativas erradas, o sistema bloqueia o e-mail por alguns minutos (rate limit).

### Credenciais de fábrica (apenas instalação nova)

- **E-mail:** `admin@gestaopro.local`
- **Senha:** `admin123`
- **Importante:** trocar essa senha imediatamente após o primeiro login.

### Esqueci a senha

Não há recuperação por e-mail pública. Peça a um **ADMIN** para resetar pela tela **Funcionários** → ações → **Trocar senha**.

---

## 3. Perfis de acesso (papéis)

Cada usuário tem **um papel** e uma lista de **módulos liberados**.

| Papel | O que pode fazer | Módulos típicos |
|-------|------------------|-----------------|
| **ADMIN** | Tudo. Cria/exclui usuários, troca papéis, mexe em configurações, vê logs, faz backup, reseta o sistema. | Todos (17 módulos) |
| **GERENTE** | Quase tudo, exceto gerenciar funcionários. Aprova sangrias/fechamento de caixa de vendedores. | 17 (sem Funcionários) |
| **VENDEDOR** | PDV, Caixa, Clientes, Produtos, Orçamentos, Funil, Comandas. Sem acesso a relatórios, financeiro ou compras. | 7 padrão (ajustáveis) |

> O **ADMIN nunca pode ser trancado** fora do sistema — mesmo sem permissão explícita, tem acesso total como salvaguarda.

### Editando permissões

ADMIN → **Funcionários** → clicar no funcionário → marcar/desmarcar os módulos na lista de checkboxes. A próxima vez que o usuário recarregar a página, a sidebar muda.

---

## 4. Estrutura da tela

```
┌────────────┬──────────────────────────────────────────────┐
│  SIDEBAR   │  HEADER (notificações, perfil, tema)         │
│            ├──────────────────────────────────────────────┤
│  📊 menu   │                                              │
│  📋 com    │           ÁREA PRINCIPAL                     │
│  ícones    │           (tela ativa)                       │
│  por       │                                              │
│  seção     │                                              │
│            │                                              │
└────────────┴──────────────────────────────────────────────┘
```

- **Sidebar fixa à esquerda** (240px) com 7 seções: Operação, Cadastros, Estoque, Vendas, Financeiro, Atendimento, Sistema.
- **Botão retrátil**: clique no logo para encolher a sidebar para 72px (só ícones). A preferência fica salva por usuário.
- **Mobile (≤900px)**: sidebar vira off-canvas; botão `☰` no topo abre/fecha.
- **Sino 🔔** no header abre o painel de **Alertas** (estoque baixo, contas a vencer).
- **Avatar** no header dá acesso a Aparência, Trocar Senha e Sair.
- **Tarja superior vermelha** aparece quando o sistema fica offline; **amarela** quando a internet está instável.

---

## 5. Módulos por seção da sidebar

### 5.1 Operação

#### 🛒 PDV — Ponto de Venda

**O que faz:** registra vendas no balcão com leitor de código de barras, cliente opcional, desconto, várias formas de pagamento e cupom impresso.

**Para que serve:** é o coração do dia a dia. Toda venda começa e termina aqui.

**Como usar:**

1. **Abrir o caixa primeiro** (botão "🟢 Abrir caixa" no banner — vide [Caixa](#-caixa)). Sem caixa aberto, o botão "Finalizar venda" fica bloqueado.
2. **Bipar o produto** ou digitar código/nome no campo central. Pressione **Enter** para adicionar à cestinha (à esquerda).
3. (Opcional) selecione **cliente**, aplique **desconto** (valor ou %), troque **vendedor**.
4. Pressione **F10** ou clique em "💳 Finalizar venda".
5. No modal de pagamento, escolha a **forma de pagamento** (F1–F6 ou clique):
   - **F1** Dinheiro — pede valor recebido e calcula troco
   - **F2** PIX
   - **F3** Débito / **F4** Crédito
   - **F5** Boleto / **F6** Crediário
   - **+** Formas customizadas (criadas pelo ADMIN)
6. Para **CARTAO_CREDITO / BOLETO / CREDIARIO**, defina **vencimento** e **número de parcelas** — o sistema gera automaticamente as contas a receber.
7. Confirme. O cupom é exibido. Clique em **Imprimir** ou **WhatsApp** para enviar ao cliente.
8. O carrinho é limpo automaticamente. Próxima venda já está pronta.

**Atalhos:**
- **F1–F6** — formas de pagamento
- **F8** — modal "Cancelar item"
- **F9** — salvar atendimento em espera
- **F10** — abrir pagamento
- **Esc** — limpa campo de busca ou fecha modal
- **Setas ↑↓** — navega nas sugestões

**Cupom impresso** traz: logo da empresa, razão social, CNPJ, endereço, itens, total, forma de pagamento, vendedor, data/hora e número da venda.

**Maquininha Mercado Pago Point** (se ativada em Configurações): botão "📲 Maquininha MP" cobra direto na máquina física, com polling de aprovação a cada 2s. A venda só é criada **após** o pagamento ser aprovado pelo MP.

**Recuperação de rascunho:** se você fechar o navegador no meio de uma venda, ao reabrir o PDV aparece um banner azul "Você tinha N itens — Recuperar / Descartar". O carrinho é salvo a cada 600ms.

**Atendimentos em espera (salvar para depois):** está atendendo um cliente que precisou sair (foi buscar outro produto, esqueceu o cartão no carro)? Clique em **"Salvar atendimento"** (ou **F9**) no topo da cestinha. O carrinho atual é congelado e a tela fica livre para o próximo cliente.

- A espera fica salva **no servidor** e aparece para **qualquer operador** do balcão (útil em troca de turno / caixa compartilhado).
- Para retomar, clique no botão **"⏱ Em espera (N)"** no topo da cestinha → escolha o atendimento → **↩ Retomar**. Os itens, o cliente e o desconto voltam para a cestinha.
- Se você já tiver itens na cestinha ao retomar, eles são **salvos em espera automaticamente** antes — você nunca perde um atendimento ao trocar de cliente.
- Cada espera mostra nº, cliente, quantidade de itens, total, há quanto tempo foi salva e quem salvou.
- Cliente desistiu? **Descartar** (pede confirmação) remove a espera.
- Importante: a espera **não é uma venda** — não baixa estoque, não consome número de venda nem mexe no caixa. Isso só acontece quando você retoma e finaliza normalmente (F10).

**Orçamento rápido (enviar por WhatsApp / e-mail):** o cliente quer "pensar" e levar os preços anotados? Em vez de refazer tudo na tela de Orçamentos, clique em **"📄 Orçamento"** no topo da cestinha. Abre um modal com os itens do carrinho já preenchidos.

- Confirme/ajuste **nome, telefone e e-mail** do cliente (se houver um cliente selecionado na venda, esses campos já vêm preenchidos). Opcionalmente defina **validade em dias** e uma **observação** (condições de pagamento, prazo de entrega).
- Escolha o envio: **💬 WhatsApp** (abre a conversa com o resumo do orçamento já digitado), **✉️ E-mail** (abre o cliente de e-mail com assunto e corpo prontos) ou **Só salvar** (gera o orçamento sem enviar).
- Em todos os casos o orçamento é **salvo de verdade** (status *Rascunho*) e fica disponível na tela **Orçamentos** para acompanhar, aprovar e depois converter em venda.
- A **cestinha continua intacta** — gerar o orçamento é um passo de pré-venda; você pode finalizar a venda normalmente em seguida (F10) ou colocar em espera.

---

#### 🍽️ Central de Comandas

**O que faz:** painel Kanban para bar/restaurante/lanchonete. Cada comanda passa pelas etapas Novos → Em preparação → Pronto → Servindo (mesa) / Em entrega (delivery) → Concluída.

**Para que serve:** separar o **fluxo da cozinha** (produção) do **fluxo do caixa** (cobrança). A cozinha imprime o pedido; o garçom acompanha; o caixa fecha a venda.

**Como usar:**

1. Garçom abre o **PDV Volante** no celular (vide [PDV Volante](#-pdv-volante-mobile)) e cria a comanda com tipo:
   - **🍽 Mesa** — pede mesa
   - **📦 Viagem** — sem mesa, sem entrega
   - **🛵 Delivery** — pede endereço + telefone + entregador
2. Pedido aparece na **coluna Novos** do Kanban.
3. Cozinha clica **✓ Aceitar** → vai para **Em preparação**.
4. Quando pronto, clica **🔔 Pronto** → vai para **Pronto**.
5. Mesa: clica **🍽 Servir** → Servindo. Delivery: clica **🛵 Entregar** + informa entregador → **Em entrega**.
6. Para fechar, clica **💰 Fechar venda** — abre o PDV pré-preenchido com os itens da comanda.

**Adicionar itens à comanda aberta:** modal de detalhe → botão tracejado âmbar "+ Adicionar item". Imprime **cupom de adendo** (só os novos itens, marcado `*** ADENDO ***`).

**Filtros:** segmento `[📋 Tudo] [🍽 Mesa] [📦 Viagem] [🛵 Delivery]` no topo. Persiste por dispositivo.

---

#### 📲 PDV Volante (mobile)

**O que faz:** versão para celular do PDV, voltada para garçom de mesa ou tirador de pedidos.

**Como usar:**

1. No celular, fazer login e navegar até "PDV Volante" (ou abrir o app instalado).
2. Escolher tipo: **Mesa / Viagem / Delivery**.
3. Adicionar produtos (busca + qtd + observações).
4. Em **DELIVERY**, preencher endereço + telefone + entregador.
5. "Enviar pedido" → vai para a Central de Comandas como **Novo**.
6. Se a mesa já tem comanda aberta, aparece banner "🔁 Mesa X tem comanda #N aberta · + Adicionar". Permite acrescentar itens em vez de criar nova.

**Sem rede:** funciona para criar nova comanda em modo offline (salva no IndexedDB e sincroniza depois). Adicionar item a comanda existente **exige rede** (precisa do ID do backend).

---

#### 💵 Caixa

**O que faz:** controla o dinheiro físico que entra e sai do PDV no dia.

**Para que serve:** garantir que o dinheiro contado no fim do dia bate com o que o sistema esperava (conferência cega). Evita roubo, esquecimento, troco errado.

**Como usar:**

1. **Abrir caixa** (botão 🟢) — informe **saldo inicial** (o sistema sugere o "troco do dia seguinte" do último fechamento).
2. Operar normalmente no PDV. Cada venda em **DINHEIRO** soma; PIX/cartão entram no extrato mas não afetam o saldo físico.
3. Movimentações manuais (botões coloridos):
   - **🟡 Sangria** — retirar dinheiro do caixa (ex: levar pro cofre). VENDEDOR precisa de **autorização de gerente** (e-mail + senha).
   - **🟢 Suprimento** — colocar dinheiro no caixa.
4. **Fechar caixa** (conferência cega):
   - Conte o dinheiro físico.
   - Digite o valor contado **antes** de ver o esperado.
   - Informe o **troco do próximo dia** (quanto vai deixar pra começar amanhã).
   - O sistema mostra **diferença = contado − esperado**:
     - 🟢 zero = sem diferença
     - 🟡 positiva = sobra
     - 🔴 negativa = quebra

**Abas:**
- **Meu caixa** — KPIs e ações do caixa aberto
- **Extrato #N** — todas as movimentações em ordem com saldo acumulado
- **Histórico** — caixas anteriores

**Cancelamento de venda em caixa aberto** gera automaticamente um lançamento `ESTORNO_VENDA` (saída) — o saldo volta ao que era antes.

---

### 5.2 Cadastros

#### 👥 Clientes

**O que faz:** cadastro de clientes (PF e PJ), com histórico de compras, segmentação RFM, score de lead, tags, contatos múltiplos (B2B), interações e tarefas.

**Para que serve:** identificar quem compra, calcular ticket médio e LTV, fazer campanhas direcionadas, gerar contas a receber em vendas a prazo.

**Como usar (cadastro):**

1. Botão **+ Novo cliente** abre modal "luxuoso" em 3 seções:
   - **Identificação** — nome (obrigatório), CPF/CNPJ (com máscara automática), tipo (PF/PJ), e-mail, telefone, data de nascimento, origem (Indicação, Instagram, Google…), status do funil (Lead, Cliente Ativo, Inativo, Perdido).
   - **Endereço** — CEP autocompleta via ViaCEP (rua, bairro, cidade, UF). Complemento separado.
   - **Observações** — anotações livres.
2. Salvar — barra de progresso mostra **% de preenchimento** (0-100% baseado em 10 campos).
3. Cliente vira **Lead** por padrão. Ao fazer a 1ª venda, promove automaticamente para **Cliente Ativo**.

**Tabela de clientes** exibe nome + chips de status, ações: editar, ver perfil (modal com 4 abas: Resumo, Contatos B2B, Interações, Tarefas), inativar (soft) ou excluir (permanente — só se não houver vendas).

**Botões de contato** em cada linha:
- 💬 WhatsApp (abre wa.me/<telefone>)
- 📞 Ligar (tel://)
- ✉️ E-mail (mailto:)
- Dropdown de templates pré-definidos (cobrança, reativação, pós-venda etc.)

---

#### 📊 Segmentos (RFM + Lead Scoring)

**O que faz:** classifica clientes automaticamente em 6 segmentos baseados em comportamento de compra.

**Para que serve:** identificar quem está VIP, quem está em risco de sair, quem nunca comprou — para campanhas direcionadas.

**Segmentos RFM:**

| Segmento | Quem é | Cor |
|----------|--------|-----|
| **VIP** | Compra muito e recentemente | Roxo |
| **RECORRENTE** | Compra com regularidade | Azul |
| **NOVO** | Cliente recente, ainda construindo | Verde |
| **EM_RISCO** | Comprava muito, parou | Amarelo |
| **INATIVO** | Não compra há tempo | Vermelho |
| **PROSPECT** | Cadastrado mas nunca comprou | Cinza |

**Lead Scoring (0-100):** soma Recência (35) + Frequência (25) + Monetário (25) + Bônus (NPS + tag VIP, max 15).

| Classificação | Score | Ícone |
|---------------|-------|-------|
| **VIP** | 76-100 | 🌟 |
| **QUENTE** | 51-75 | 🔥 |
| **MORNO** | 26-50 | 😐 |
| **FRIO** | 0-25 | 🥶 |

**Como usar:**

1. Janela RFM configurável (90/180/365/730 dias) no topo.
2. Cards clicáveis por segmento — filtra a tabela embaixo.
3. Coluna de score com barra colorida.
4. Botão "Gerir tags" — cria/edita tags customizadas (ex: "VIP", "Atacado", "Devedor").
5. Botão "Tags do cliente" — atribui tags a cada cliente individualmente.

---

#### 🎂 Aniversários / Reativação

**O que faz:** lista clientes aniversariantes do mês e clientes inativos (sem comprar há X dias).

**Para que serve:** mandar parabéns no WhatsApp e tentar reativar quem sumiu.

**Como usar:**

- **Aba Aniversariantes** — filtro por mês; destaque para os aniversariantes **de hoje** (bloco laranja).
- **Aba Reativação** — KPIs (quantos sem comprar há X / LTV total em risco / LTV médio) + tabela ordenada por LTV.
- Cada linha tem botões de contato (WhatsApp, e-mail) com templates pré-formatados.

---

#### 🏭 Fornecedores

**O que faz:** cadastro de fornecedores com dados fiscais e de contato.

**Para que serve:** vincular a compras (entrada de mercadoria) e contas a pagar.

**Como usar:** mesmo padrão de Clientes (modal luxuoso, máscaras CNPJ/CEP/telefone, ViaCEP, soft-delete vs delete permanente).

---

#### 📦 Produtos

**O que faz:** cadastro do que você vende ou usa internamente.

**Para que serve:** alimentar PDV, estoque, compras, orçamentos, etiquetas.

**Tipos de item:**

- **📦 PRODUTO** — físico, com estoque. Cai em alertas se zerar.
- **🛠 SERVIÇO** — impressão, encadernação, taxa de boleto. Sem estoque. Sempre disponível. Não aparece em alertas.

**Identificadores (qualquer um vale no PDV):**

- **Código interno** (obrigatório, único)
- **Código de barras / EAN** (opcional, único quando preenchido)
- **Referência** (livre, código do fornecedor)
- **Fabricante / Marca** (opcional, cadastro reutilizável — ex.: BIC, Faber-Castell, Bosch)
- **Nome** (busca por trecho)

**Como usar (form em 5 seções):**

1. **Identificação** — código (sugestão automática), nome, descrição, código de barras, referência, fabricante/marca. O **Fabricante / Marca** é um cadastro reutilizável: selecione um já existente na busca ou clique no botão **+ Novo** ao lado para cadastrar um novo sem sair da tela — ele já fica selecionado e disponível para os próximos produtos.
2. **Imagem** — dropzone (arraste ou clique). Até 2 MB, JPG/PNG/WebP.
3. **Tipo do item** — radio cards Produto/Serviço.
4. **Preços e estoque** — preço de custo, cálculo de markup, preço de venda, estoque atual, estoque mínimo, unidade (UN, KG, M, L, PCT…).
5. **Categorização** — categoria (cria inline se não existir), fornecedor padrão, tributação fiscal (NCM, CEST, CFOP, Origem, CST/CSOSN, PIS, COFINS, cBenef).

**Cálculo de markup** — dois jeitos de chegar ao preço de venda:
- **Margem sobre o custo** — digite a margem desejada (ex.: 120%) e o preço de venda é calculado na hora como `custo × (1 + margem%)` (custo 10,00 + 120% = 22,00). É bidirecional: se você digitar o preço de venda direto, o campo de margem mostra automaticamente qual margem aquele preço representa.
- **Formação de preço (margem sobre a venda)** — informe impostos sobre venda, taxas de cartão e a margem desejada; o sistema sugere o preço "por dentro" (`custo ÷ (1 − soma%)`) e o botão **Aplicar ao preço de venda** preenche o campo. Como a margem aqui é sobre a venda, a soma dos percentuais precisa ser menor que 100%.

**Lista:** miniatura, badges (`SERVIÇO`, `📊 EAN`, `🏷 REF`), unidade, estoque atual (com cor: verde > mínimo, amarelo = mínimo, vermelho < mínimo, ♾ se serviço), botão **📊 Movimentar estoque**.

**Busca:** placeholder "Buscar por código, código de barras, referência ou nome…"

**Inativar / Reativar um produto:** inativar é a forma correta de "tirar de circulação" um produto sem apagar o histórico — ele some das buscas do PDV (não pode mais ser vendido), mas as vendas antigas continuam intactas. Há duas formas:

- **Na lista:** clique no botão **`···`** (coluna *Ações*, à direita da linha) → **⊘ Inativar** (ou **↻ Reativar** se já estiver inativo) → confirme.
- **Dentro do cadastro:** ao **editar** um produto, há o botão **⊘ Inativar produto** (ou **↻ Reativar produto**) no canto inferior esquerdo do formulário, ao lado de Cancelar/Salvar.

O status alterna entre **ATIVO** (verde) e **INATIVO** (cinza). Use o filtro **"Todos status" → "Apenas inativos"** no topo da tela para listar os inativos.

> Inativar/reativar pode ser feito por **ADMIN** e **GERENTE** (mesmos perfis que editam produtos). Não há exclusão permanente de produto: "inativar" é um soft-delete que preserva todo o histórico de vendas, compras e estoque.

**Histórico de compras de um produto:** ao **editar** um produto físico, o botão **🚚 Histórico de compras** (no canto inferior esquerdo do formulário, ao lado de *Inativar produto*) abre uma janela com **todas as entradas de compra daquele produto por fornecedor**: data, número da compra, fornecedor, quantidade, custo unitário e subtotal. No topo há um resumo — quantas compras, quantidade total comprada, total gasto, **custo médio** e o **último custo** (com a data e o fornecedor). Compras estornadas aparecem marcadas como **ESTORNADA** e não entram no resumo (o estorno já reverteu a entrada). Serviços não têm esse botão (não entram em compras).

---

#### 🏷️ Etiquetas

**O que faz:** gera folhas de etiquetas de preço para impressão (papel A4 com várias etiquetas por folha).

**Para que serve:** colar nos produtos da loja. Suporta vários formatos e layouts pré-definidos.

**Como usar:** selecionar produtos, escolher template (3×7, 4×8, etc.), pré-visualizar, imprimir.

---

### 5.3 Estoque

#### 🗃️ Estoque

**O que faz:** controle de entradas, saídas e ajustes manuais por produto.

**Para que serve:** rastrear movimentações fora das vendas/compras (ex: perda, doação, transferência).

**Como usar:**

1. Botão **+ Nova movimentação**.
2. Tipo: **ENTRADA / SAIDA / AJUSTE**.
3. Produto, quantidade, motivo (texto livre).
4. Salvar — o estoque do produto é atualizado automaticamente e a movimentação fica registrada em ordem cronológica.

**Movimentações automáticas (não manuais):**
- Venda no PDV gera SAIDA
- Compra gera ENTRADA
- Cancelamento de venda gera ENTRADA de estorno
- Estorno de compra gera SAIDA de estorno

**Filtros:** tipo, produto, período.

---

#### 📋 Inventário

**O que faz:** contagem cíclica de estoque com 3 telas (lista, contagem, detalhe).

**Para que serve:** auditar o estoque físico contra o sistema (geralmente 1x/mês).

**Como usar:**

1. **Criar inventário** — escolhe categoria(s) ou produtos específicos.
2. Sistema gera lista a contar.
3. **Aba Contagem** — para cada produto, conta no físico e digita. Pode ser feito no celular (versão mobile dedicada).
4. **Aba Detalhe** — vê divergências (sistema vs contado) e pode aprovar ajuste automático em massa.
5. Após aprovar, gera **MovimentacaoEstoque AJUSTE** para cada divergência.

---

### 5.4 Vendas & CRM

#### 🛍️ Compras

**O que faz:** registra entrada de mercadoria do fornecedor.

**Para que serve:** atualizar estoque automaticamente e gerar conta a pagar.

**Como usar:**

1. **+ Nova compra** → fornecedor → adicionar itens (busca produto, qtd, custo unitário).
   - **Dica de teclado:** ao terminar o **preço** do último item, aperte **Tab** que já abre a próxima linha com o foco no campo de produto — dá pra lançar a nota inteira sem tirar a mão do teclado.
2. **Subtotal** somado automaticamente. Há um campo **Desconto de ajuste** (R$) para abater bonificações/acertos do fornecedor; o **Total da compra** = subtotal − desconto, e é esse valor líquido que vira conta a pagar.
3. **💾 Salvar rascunho** (rodapé): guarda a compra pela metade **neste dispositivo** para retomar depois. Os rascunhos aparecem numa faixa no topo da tela de Compras com **Retomar** / **Descartar**. Ao **Registrar** uma compra retomada, o rascunho some sozinho. (É local ao navegador — não fica compartilhado entre dispositivos.)
4. Bloco verde **"💰 Gerar conta a pagar"** (ligado por padrão):
   - Vencimento (default: hoje + 30 dias)
   - Parcelas (1× à vista até 12×)
   - Preview: "✓ 3× R$ 100,00 — vencendo no dia 15 de cada mês a partir de 15/06/2026"
5. **Registrar** — em uma transação, cria: compra + ENTRADA no estoque para cada item + N contas a pagar com `grupoRecorrenciaId` compartilhado.

**Estornar compra:** detalhe → botão "↩ Estornar". Pede motivo. Reverte estoque (SAIDA), cancela contas pendentes. Bloqueia se houver conta já paga (precisa reabrir no Financeiro primeiro).

---

#### 📝 Orçamentos

**O que faz:** monta uma pré-venda com validade para o cliente decidir depois.

**Para que serve:** pedidos grandes, orçamentos por e-mail, propostas.

**Como usar:**

1. + Novo orçamento → cliente + itens + validade (dias).
2. Status: **ABERTO → ACEITO → CONVERTIDO em venda** (botão "Converter em venda" abre o PDV pré-preenchido) ou **RECUSADO / EXPIRADO**.
3. Pode anexar PDF/imagens.
4. Botão "WhatsApp" envia link/texto formatado.

---

#### 🎯 Funil de Vendas

**O que faz:** Kanban de oportunidades comerciais em 6 etapas: LEAD → QUALIFICADO → PROPOSTA → NEGOCIAÇÃO → GANHO / PERDIDO.

**Para que serve:** acompanhar leads desde o primeiro contato até o fechamento.

**Como usar:**

1. **+ Nova oportunidade** → cliente + título + valor + etapa inicial.
2. **Arrastar** o card entre colunas para mudar de etapa (drag & drop).
3. Ao mover para **PERDIDO**, sistema **obriga informar motivo** (preço, prazo, concorrente etc.) — vira fonte de relatório.
4. Atalho **"✨ Usar exemplo"** preenche os campos com um caso fictício para testar.

**Cores das colunas:** cinza/azul/roxo/laranja/verde/vermelho.

**Dashboard CRM** consome esses dados para taxa de conversão etapa-a-etapa.

---

#### ⚡ Automações

**O que faz:** dispara tarefas automaticamente conforme regras.

**Tipos suportados:**

- **CLIENTE_INATIVO** — sem comprar há N dias → gera tarefa "Reativar fulano (90 dias sem comprar)"
- **ORCAMENTO_PARADO** — orçamento aberto há N dias sem resposta → tarefa de follow-up
- **POS_VENDA_FOLLOWUP** — N dias após venda → tarefa "Perguntar se gostou + pesquisa NPS"

**Como usar:**

1. **+ Nova regra** → nome, tipo, dias-gatilho, template de título da tarefa (com variáveis `{{nomeCliente}}`, `{{valorVenda}}` etc.).
2. **Botão "✨ Usar exemplo"** preenche um exemplo.
3. Salvar → fica ativa. Backend roda diariamente (cron externo).
4. **Botão "Executar agora"** dispara manualmente para teste.
5. **Histórico** mostra últimas 50 execuções (cliente afetado, tarefa criada, erro se houver).

**Anti-duplicação:** o sistema nunca cria 2 tarefas idênticas para o mesmo contexto (cliente+regra ou venda+regra).

---

#### ⭐ NPS pós-venda

**O que faz:** pesquisa de satisfação enviada ao cliente após cada venda.

**Para que serve:** medir lealdade (NPS = % Promotores − % Detratores) e identificar pontos de melhoria.

**Como usar:**

1. Cliente compra → sistema gera pesquisa com **token único** automaticamente.
2. Vendedor envia link no WhatsApp pelo botão na tela NPS.
3. Cliente abre o link **sem precisar fazer login** (rota pública `?nps=<token>`):
   - Escolhe nota de **0 a 10** (escala visual colorida).
   - Comentário opcional.
   - Confirma.
4. **Dashboard NPS** mostra: KPIs, barra empilhada (detratores/neutros/promotores), 3 abas (Respondidas / Pendentes / Todas).

**Classificação NPS:**

| Nota | Categoria | Cor |
|------|-----------|-----|
| 0-6 | Detrator | Vermelho |
| 7-8 | Neutro | Amarelo |
| 9-10 | Promotor | Verde |

---

#### 🎯 Dashboard CRM

**O que faz:** consolida funil + segmentos + LTV + tarefas + NPS + performance comercial numa tela só.

**Para que serve:** visão de gestão comercial em tempo real.

**Como usar:**

- Filtro de janela (7/30/90/365 dias) no topo.
- 6 KPIs (oportunidades abertas, taxa de conversão, ticket médio, valor em risco, NPS score, vendas no período).
- Funil em barras horizontais.
- Segmentos com %.
- Top 10 LTV + Top 10 em risco lado a lado.
- Tabela de performance por vendedor.

---

#### ✅ Tarefas

**O que faz:** lista de tarefas com cliente vinculado, prazo, prioridade e responsável.

**Para que serve:** cobranças, follow-ups, lembretes — manuais ou geradas por automações.

**Como usar:**

1. **+ Nova tarefa** → título, cliente (opcional), responsável, prazo, prioridade.
2. Visualizações: **Hoje / Atrasadas / Futuras / Concluídas**.
3. Marcar como concluída → vai para o histórico.

---

#### 🏆 Fidelidade

**O que faz:** pontos por compra + resgate por desconto.

**Para que serve:** programa de fidelidade simples para reter clientes.

**Como usar:**

1. ADMIN configura a regra: "R$ X gastos = 1 ponto" e "Y pontos = R$ Z de desconto".
2. Cliente vinculado a venda acumula pontos automaticamente.
3. No PDV, antes de fechar, operador pode **resgatar pontos** como desconto.

---

#### 🏆 Comissões

**O que faz:** calcula comissão do vendedor por venda.

**Para que serve:** apurar a folha de pagamento variável.

**Como usar:**

1. ADMIN/GERENTE define a regra (% sobre faturamento ou margem) em **Sistema → Configurações de Comissão**.
2. Cada venda registra o vendedor.
3. Tela mostra ranking por período + valor total a pagar.

---

### 5.5 Financeiro

#### 💰 Financeiro

**O que faz:** gestão de **Contas a Pagar** (CP) e **Contas a Receber** (CR) com pagamentos parciais, recorrência, anexos e ações em lote.

**Para que serve:** controlar fluxo de caixa, prever inadimplência, fechar mês.

**Como usar:**

**Abas:** 💸 Contas a Pagar | 💰 Contas a Receber

**KPIs interativos no topo** — clique para filtrar a tabela:
- 📋 Pendentes
- ⏰ Atrasadas
- 🔔 Vencendo em 7 dias (cliente-side)
- ✅ Pagas/Recebidas

**Tabela agrupada em buckets dinâmicos:**

- 🔴 **Vencidas**
- 🟡 **Vence hoje**
- 🟠 **Esta semana**
- 🔵 **Próximas 30 dias**
- ⚪ **Futuras**
- ✅ **Concluídas** (colapsado por padrão)

Cada grupo tem header colapsável com contagem + subtotal.

**Ações por linha:**
- Pagar/Receber (parcial ou total — escolhe forma de pagamento; cria movimentação no Caixa se aberto)
- Cancelar (com motivo)
- Reabrir (se já paga)
- Anexar PDF/imagem do boleto (até 5 MB)
- Editar / Excluir

**Ações em lote:** marcar checkbox de várias contas → barra flutuante mostra "X selecionadas · R$ Y" → botões "Pagar selecionadas" / "Cancelar contas".

**Recorrência:** ao criar conta, marque **PARCELADA** (gera N contas mês a mês com `grupoRecorrenciaId` compartilhado) ou **RECORRENTE_MENSAL**.

---

### 5.6 Atendimento

#### 💬 WhatsApp

**O que faz:** atendimento integrado com mensagens diretas, templates e histórico de conversas.

**Para que serve:** centralizar o atendimento via WhatsApp Business sem precisar abrir o aplicativo separadamente.

**Como usar:** depende da integração configurada (varia por instalação).

---

### 5.7 Sistema

#### 📊 Dashboard

**O que faz:** painel principal com KPIs do dia/semana/mês.

**Mostra:**
- Vendas do dia (valor + qtd)
- Gráfico de vendas semanal (barra por dia)
- Top 5 produtos mais vendidos
- Top 5 vendedores
- Estoque baixo (produtos abaixo do mínimo)
- Resumo financeiro (a pagar / a receber / vencendo / atrasadas)

---

#### 📑 Relatórios

**O que faz:** 7 abas de relatórios com filtros e **export PDF** com cabeçalho da empresa.

**Abas:**

1. **📦 Vendas** — período, vendedor, forma, cliente. Tabela + totais.
2. **🛍 Compras** — período, fornecedor. Tabela + totais.
3. **💰 Financeiro** — sub-abas Pagar / Receber, status, período.
4. **🗃 Estoque** — situação atual por produto/categoria.
5. **💵 Caixas (DRE)** — DRE diário com entradas/saídas/quebras/sobras + detalhe por caixa.
6. **🏆 Comissões** — ranking por vendedor.
7. **🎯 CRM** — 7 sub-relatórios:
   - Funil de Vendas (conversão etapa-a-etapa)
   - Performance Comercial
   - Carteira (RFM detalhado)
   - NPS
   - Atividades & Cadência
   - Forecast
   - Perdas (motivos)

**PDF:** cabeçalho com logo + razão social + CNPJ + endereço, depois título, período e tabelas.

---

#### 🔔 Alertas

**Acessado pelo sino 🔔 no header.**

**O que faz:** painel lateral com alertas operacionais.

**Tipos de alerta:**
- 📦 Produto X abaixo do estoque mínimo (clique → vai pro Estoque)
- 💸 Conta a pagar vencendo / atrasada
- 💰 Conta a receber vencendo / atrasada

**Polling:** atualiza a cada 60s automaticamente.

---

#### 🏢 Empresa

**O que faz:** cadastro singleton de **Dados do Emitente** (razão social, CNPJ, endereço, contato, logotipo) + **Plano + Limites de uso**.

**Para que serve:** aparece no cupom do PDV, no extrato do Caixa e no cabeçalho dos PDFs de Relatórios. Tela única.

**Como usar:**

1. Aba **Identidade** — razão social, nome fantasia, CNPJ, inscrição estadual, telefone, e-mail.
2. Aba **Endereço** — com ViaCEP.
3. Aba **Logotipo** — dropzone (JPG/PNG/WebP, até 2 MB).
4. Aba **Observações** — texto livre que aparece em todos os relatórios.

**Bloco "Plano":**

- Badge do plano (TRIAL / FREE / STARTER / PRO / ENTERPRISE)
- Aviso de expiração (vermelho se expirou, amarelo se ≤7 dias)
- 4 barras de progresso uso/limite:
  - **Clientes** (X / Y)
  - **Produtos** (X / Y)
  - **Usuários** (X / Y)
  - **Vendas no mês** (X / Y)
- Cores: 🟢 <70%, 🟡 70-90%, 🔴 ≥90%
- `∞` = ilimitado

**Bloco "Preferências deste dispositivo":**

- 📡 **Avisos de conexão com o servidor** — interruptor liga/desliga a tarja vermelha/amarela do topo e os toasts automáticos de "sem conexão" / "servidor instável". Erros específicos das telas (validação, 4xx) continuam aparecendo normalmente. Vale só neste navegador (localStorage).

---

#### 🖨️ Configurações de Impressora

**O que faz:** configura impressora térmica (Bluetooth ou USB ESC/POS) usada para cupons e adendos.

**Para que serve:** PDV imprimir cupom automático sem abrir caixa de diálogo do sistema operacional.

---

#### 🧑‍💼 Funcionários (ADMIN only)

**O que faz:** CRUD de usuários do sistema.

**Como usar:**

1. **+ Novo funcionário** → nome, e-mail, telefone, senha temporária, papel (ADMIN/GERENTE/VENDEDOR), módulos liberados (checkboxes).
2. Tabela lista todos com chips de módulos coloridos (até 4 + `+N`).
3. Ações: editar, **trocar senha**, inativar/reativar, excluir (só se não tiver vendas vinculadas).

---

#### 📲 Maquininha MP / Mercado Pago

**Em Configurações:** bloco dedicado.

**Para configurar (1ª vez):**

1. Pegue o **Access Token** no painel do Mercado Pago Developers.
2. Pegue o **Device ID** do parelhamento da maquininha (Modo PDV).
3. Cole nos campos correspondentes na tela Configurações.
4. Marque "Ativa".
5. Salve.

A partir daí, o PDV mostra o botão **📲 Maquininha MP** no modal de finalizar. O cliente passa o cartão na maquininha física; o sistema aguarda aprovação via polling + webhook.

**Token cifrado** (AES-256-GCM) no banco — não é exibido após salvar (mascarado).

---

#### 📋 Projeto

**O que faz:** acompanha as 14 etapas planejadas do sistema com status (✅ concluído / ⏳ em andamento / 🔜 planejado).

**Para que serve:** transparência sobre o que está pronto e o que vem a seguir.

---

#### 📜 Logs de Auditoria (ADMIN only)

**O que faz:** trilha completa de tudo que acontece no sistema.

**Para que serve:** auditoria, segurança, investigação de problema.

**Registra:**
- Login / Login Falho (com motivo) / Logout / Troca de senha
- Toda operação CREATE / UPDATE / DELETE
- IP, user-agent, rota, payload sanitizado (sem senhas/tokens)
- **Diff campo a campo** em updates (antes/depois lado a lado)
- Reset Total (com breakdown completo)

**Tabela densa** com filtros: usuário, módulo, ação, sucesso/falha, período, busca em rota/mensagem. Clique numa linha expande mostrando diff visual em vermelho/verde.

**KPIs:** 24h, 7d, falhas, módulo mais ativo.

---

#### 💾 Backup (ADMIN only)

**O que faz:** baixa um JSON com todos os dados do tenant ou restaura a partir de um JSON.

**Para que serve:** segurança contra perda de dados, migração entre ambientes.

**Como usar:**

1. **Download** — botão "Baixar backup" → gera JSON com timestamp no nome → salva no computador.
2. **Restaurar** — botão "Restaurar de arquivo" → escolhe JSON → confirmação dupla (digita "RESTAURAR") → substitui dados atuais.

> Ferramenta mais robusta para devs: `npm run db-manager backup` / `restore` no backend, via pg_dump/psql.

---

#### 🛡 Sistema (ADMIN only)

**O que faz:** ações administrativas críticas.

**Inclui:**

- **Reset Total** — apaga **tudo** (vendas, caixas, compras, estoque, financeiro, cadastros, produtos, fotos, anexos) mas preserva funcionários, dados da empresa e logotipo. Confirmação dupla com texto "CONFIRMAR_RESET". Auditado no Logs com breakdown.
- **Gerenciar formas de pagamento custom** — criar formas além das 6 padrão (Dinheiro/PIX/Débito/Crédito/Boleto/Crediário).
- **Configurações gerais** (cor de tema padrão, comportamento de pré-impressão, etc.).

---

#### 🎨 Aparência

**Acessado pelo avatar no header.**

**O que faz:** escolha entre **6 temas** (3 claros, 3 escuros).

**Persistência:** preferência sincronizada entre dispositivos (salva no servidor).

---

## 6. Resiliência a falhas de rede

O sistema é projetado para **degradar com graça** quando a internet falha.

**Indicadores visuais:**

- **Tarja vermelha** no topo: você está **offline** (sem internet).
- **Tarja amarela** no topo: internet OK mas o **servidor está instável** (timeout/5xx).
- **Toasts inferior direito**: erros classificados em NETWORK / TIMEOUT / SERVER_5XX / CLIENT_4XX / AUTH / ABORT — dedup de 1.5s pra não floodar.

**Comportamentos:**

- **PDV** — o **carrinho é salvo a cada 600ms** no navegador (localStorage). Se a aba fecha ou o navegador trava, ao reabrir aparece banner "Você tinha N itens — Recuperar / Descartar".
- **PDV Volante (mobile)** — comandas novas podem ser criadas **offline** (sincronizam depois). Adicionar item a comanda existente exige rede.
- **Finalizar venda** — bloqueado offline (precisa do servidor).
- **Botões críticos** ficam meio-opacos / sem clique quando degradado (classe `gp-bloqueio-offline`).
- Timeout padrão: 15s nas APIs, 60s em upload.
- **Desligar avisos:** se preferir uma tela mais limpa, vá em **Empresa → Preferências deste dispositivo** e desligue *Avisos de conexão com o servidor*. A tarja e os toasts automáticos somem; o bloqueio do "Finalizar venda" continua valendo.

---

## 7. Atalhos de teclado

### PDV

| Tecla | Ação |
|-------|------|
| **Enter** | Bipa o produto ou adiciona o primeiro da sugestão |
| **Setas ↑↓** | Navega nas sugestões |
| **Esc** | Limpa o campo de busca / fecha modal |
| **F1** | Pagamento em Dinheiro |
| **F2** | Pagamento em PIX |
| **F3** | Cartão Débito |
| **F4** | Cartão Crédito |
| **F5** | Boleto |
| **F6** | Crediário |
| **F8** | Modal "Cancelar item" |
| **F10** | Abre modal de pagamento |

### Modais (geral)

| Tecla | Ação |
|-------|------|
| **Esc** | Fecha o modal |
| **Enter** | Confirma o formulário |

### Sidebar

| Tecla | Ação |
|-------|------|
| Logo (clique) | Recolhe/expande |
| **Esc** (mobile) | Fecha a sidebar off-canvas |

---

## 8. Termos do sistema (glossário)

| Termo | Significado |
|-------|-------------|
| **PDV** | Ponto de Venda. Tela onde se registra a venda no balcão. |
| **Caixa** | Controle do dinheiro físico do PDV. Abrir/Fechar/Sangria/Suprimento. |
| **Sangria** | Retirar dinheiro do caixa (ex: levar ao cofre, depositar). |
| **Suprimento** | Colocar dinheiro no caixa (ex: troco extra). |
| **Quebra** | Faltou dinheiro no fechamento (contado < esperado). |
| **Sobra** | Sobrou dinheiro no fechamento (contado > esperado). |
| **Conta a Pagar** | Compromisso financeiro com fornecedor. |
| **Conta a Receber** | Compromisso financeiro do cliente com a loja. |
| **Crediário** | Venda fiada com pagamento parcelado. |
| **LTV** | Lifetime Value — total que um cliente já gastou. |
| **RFM** | Recência / Frequência / Monetário — modelo de segmentação. |
| **NPS** | Net Promoter Score — % Promotores − % Detratores. |
| **CRM** | Customer Relationship Management — gestão do relacionamento. |
| **Funil** | Etapas do processo comercial (Lead → Ganho/Perdido). |
| **Oportunidade** | Negócio em andamento, ainda não fechou. |
| **Lead** | Contato que ainda não comprou. |
| **Comanda** | Pedido aberto de mesa/viagem/delivery, antes de virar venda. |
| **Adendo** | Itens novos adicionados a uma comanda já aberta. |
| **Recorrência** | Conta repetida mês a mês (mensal/parcelada). |
| **Soft-delete** | "Excluir" mantendo no banco (ativo=false). Reativável. |
| **Hard-delete** | Excluir permanentemente. Só se não houver vínculos. |
| **Multi-tenant** | Cada empresa opera em espaço isolado. |
| **Tenant** | A empresa em si (sua conta no sistema). |

---

## 9. Operações no celular

O sistema é **PWA** — pode ser instalado como app no celular pelo banner do navegador ou pelo menu "Adicionar à tela inicial".

**Telas otimizadas para celular:**

- **PDV Volante** — versão de PDV para garçom/atendente.
- **Inventário Mobile** — contagem cíclica no chão da loja.
- **Central de Comandas** — Kanban responsivo.
- **Demais telas** — usam sidebar off-canvas com botão `☰`.

**Dicas:**

- Use Chrome ou Edge no Android, Safari no iOS.
- Adicione à tela inicial para ter ícone próprio e tela cheia.
- Verifique permissão de **Bluetooth** se for usar impressora térmica.

**Atualizações de versão:** quando uma versão nova é publicada, aparece um banner verde **"Nova versão disponível — Toque em Atualizar"** no rodapé. A atualização **não é automática** (pra não recarregar no meio de uma venda): toque em **Atualizar** quando estiver num momento seguro. O app também checa por versão nova sozinho a cada 30 min. Se o banner não aparecer e você suspeitar que está numa versão antiga, recarregue a página (no celular, feche e reabra o app).
- Carrinho do PDV não roda offline — depende do servidor.

---

## 10. Planos e limites

| Plano | Clientes | Produtos | Usuários | Vendas/mês |
|-------|----------|----------|----------|------------|
| **FREE** | 30 | 50 | 1 | 50 |
| **TRIAL** | 50 | 100 | 3 | 200 |
| **STARTER** | 500 | 1.000 | 5 | 2.000 |
| **PRO** | 5.000 | 10.000 | 20 | ∞ |
| **ENTERPRISE** | ∞ | ∞ | ∞ | ∞ |

**O que acontece ao estourar:** o sistema retorna **402 Pagamento Necessário** ao tentar criar acima do limite e mostra mensagem amigável com o plano atual + uso atual. Demais operações (editar, ver, excluir) seguem funcionando.

**Como ver o uso atual:** Empresa → Bloco "Plano" → barras de progresso.

---

## 11. Perguntas frequentes

### Esqueci a senha. Como recupero?

Não há recuperação por e-mail. Peça a um **ADMIN** ir em **Funcionários** → seu usuário → **Trocar senha**. Você troca de novo no próximo login.

### Posso usar sem internet?

Apenas parcialmente:
- ✅ Carrinho do PDV em andamento (auto-salvo no navegador).
- ✅ Criar nova comanda no PDV Volante (sincroniza depois).
- ❌ Finalizar venda no PDV.
- ❌ Adicionar item em comanda existente.
- ❌ Consultar clientes/produtos novos.

### Como faço backup dos meus dados?

ADMIN → **Backup** → "Baixar backup" → salva JSON. Faça isso semanalmente.

### O sistema imprime nota fiscal?

Não diretamente. Os produtos têm campos fiscais (NCM, CFOP, CST, PIS/COFINS) prontos pra integração com emissor externo. O cupom impresso atual é **não fiscal**.

### Posso ter mais de uma loja?

Sim, via **multi-tenant**: cada loja vira um "tenant" isolado, com plano próprio. Solicite ao super-admin a criação. Não há signup público.

### Como apago tudo para começar do zero?

ADMIN → **Sistema** → **Reset Total**. Apaga vendas, estoque, financeiro, cadastros e produtos. **Preserva** funcionários, dados da empresa e logotipo. Exige digitar "CONFIRMAR_RESET" para confirmar.

### Mudei algo no cadastro da empresa e não apareceu no cupom

O cache da configuração demora ~30s para atualizar. Atualize a página (F5) para forçar.

### A maquininha do Mercado Pago não responde

Verifique:
1. Configurações → Maquininha MP → "Ativa" marcada.
2. **Device ID** correto (sem espaços).
3. Maquininha em **Modo PDV** (não modo standalone).
4. Conexão de internet da maquininha (Wi-Fi ou 4G).
5. Status no painel do Mercado Pago.

### Apareceu "Você precisa abrir um caixa para vender"

Vá em **Caixa** → **Abrir Caixa** → informe o saldo inicial → salve. Volte para o PDV.

### Como envio o cupom para o cliente sem imprimir?

No modal do cupom (após finalizar a venda), clique no botão **WhatsApp** — abre o WhatsApp pré-preenchido com o resumo da venda.

---

## 12. Como usar a Ajuda no sistema

O próprio sistema embute este manual numa tela de **Ajuda** integrada — você não precisa abrir esse arquivo Markdown para consultá-lo no dia a dia.

### Onde encontrar

- **Sidebar → seção Sistema → ❓ Ajuda** — abre o manual completo com sumário lateral.
- **Botão ❓ Ajuda no topo da tela** (canto superior direito, ao lado do sino de alertas) — abre o manual **já posicionado no tópico relevante à tela que você está vendo**.

### Como funciona

A tela de Ajuda tem **2 colunas**:

```
┌─ Sumário ──────────┬──────── Conteúdo ──────────┐
│ 🔎 Buscar...       │  # GestãoPRO — Manual      │
│                    │                            │
│ INÍCIO             │  ## Módulo: PDV            │
│ • Visão geral      │                            │
│ • Como entrar      │  **O que faz:** registra…  │
│                    │                            │
│ OPERAÇÃO           │  **Como usar:**            │
│ • PDV         ←    │  1. Abrir o caixa…         │
│ • Comandas         │  2. Bipar produto…         │
│ • Caixa            │                            │
│ ...                │                            │
└────────────────────┴────────────────────────────┘
```

- **Coluna esquerda**: tópicos agrupados por seção (Início / Operação / Cadastros / Estoque / Vendas & CRM / Financeiro / Atendimento / Sistema / Referências). Clique em qualquer item para rolar até o tópico no conteúdo.
- **Busca**: digite no campo "🔎 Buscar tópico..." para filtrar os tópicos por nome (filtragem instantânea, sem recarregar).
- **Coluna direita**: conteúdo do manual renderizado com formatação completa (títulos, tabelas, listas, blocos de código, citações).

### Ajuda contextual

Sempre que você estiver dentro de uma tela específica (PDV, Caixa, Clientes, Financeiro, etc.) e clicar no botão **❓ Ajuda** do header, o manual abre **direto no tópico daquela tela**. Por exemplo:

- Está no PDV e clica ❓ → abre na seção "🛒 PDV — Ponto de Venda"
- Está em Caixa e clica ❓ → abre na seção "💵 Caixa"
- Está em Financeiro e clica ❓ → abre na seção "💰 Financeiro"

### Atualizações automáticas

O conteúdo da Ajuda **é o próprio arquivo `docs/MANUAL.md`** — não há duplicação. Quando o manual é atualizado, a tela reflete automaticamente na próxima vez que o sistema for buildado/publicado. Isso garante que a documentação que o usuário vê sempre bate com o sistema em produção.

---

## Anexo A — Fluxos completos (passo a passo)

### Fluxo 1: Atender um cliente no balcão

1. PDV → bipa os produtos.
2. (Opcional) seleciona cliente.
3. F10 → escolhe forma → confirma.
4. Imprime cupom e/ou envia no WhatsApp.

### Fluxo 2: Atender mesa em restaurante

1. PDV Volante (celular) → tipo MESA → digita nº da mesa.
2. Adiciona itens → "Enviar pedido".
3. Cozinha vê na Central de Comandas → ✓ Aceitar → preparar → 🔔 Pronto.
4. Garçom → 🍽 Servir.
5. Mesa pede a conta → 💰 Fechar venda → PDV pré-carrega → cobra → cupom.

### Fluxo 3: Entrada de mercadoria do fornecedor

1. Compras → + Nova compra → escolhe fornecedor.
2. Adiciona produtos com qtd e custo.
3. Marca "Gerar conta a pagar" → 3× → vencimento 30 dias.
4. Registrar → estoque sobe, 3 contas pendentes no Financeiro.

### Fluxo 4: Fechar o caixa no fim do dia

1. Caixa → conta o dinheiro físico.
2. Botão "Fechar caixa" → digita valor contado + troco para amanhã.
3. Vê diferença (sobra/quebra/zero).
4. Se VENDEDOR: pede senha do gerente.
5. Fechado → Histórico.

### Fluxo 5: Reativar cliente inativo

1. Aniversários/Reativação → aba Reativação.
2. Filtra "sem comprar há 90 dias".
3. Botão WhatsApp em cada linha → escolhe template "Reativação 90d".
4. Mensagem pré-preenchida abre no WhatsApp.

### Fluxo 6: Receber NPS de um cliente

1. Cliente faz uma compra (com cadastro vinculado).
2. NPS → aba Pendentes → encontra a venda.
3. Botão "Enviar WhatsApp" → manda o link único.
4. Cliente abre, dá nota, comenta.
5. NPS → aba Respondidas → resposta aparece no dashboard.

---

## Anexo B — Convenções visuais

**Paleta de cores (semântica):**

| Cor | Uso |
|-----|-----|
| 🔵 Azul (accent) | Ações primárias, links, KPIs neutros |
| 🟣 Roxo (purple) | Premium, VIP, autorização gerencial |
| 🟢 Verde (green) | Sucesso, entrada, ativo, pago |
| 🔴 Vermelho (red) | Erro, saída, atrasado, perigoso |
| 🟡 Amarelo (yellow) | Aviso, pendente, sangria |

**Ícones-padrão na sidebar:**

🛒 PDV · 📊 Dashboard · 🎯 CRM · 👥 Clientes · 🏭 Fornecedores · 📦 Produtos · 🏷️ Etiquetas · 💵 Caixa · 🗃️ Estoque · 📋 Inventário · 🛍️ Compras · 📝 Orçamentos · 🎯 Funil · ⚡ Automações · ⭐ NPS · 💰 Financeiro · 📑 Relatórios · 🏆 Comissões · 🍽️ Comandas · 💬 WhatsApp · 🧑‍💼 Funcionários · 🏢 Empresa · 🖨️ Impressora · 📋 Projeto · 📜 Logs · 💾 Backup · 🛡 Sistema · 🎨 Aparência

---

*Documento gerado em 26/maio/2026. Próxima revisão sugerida: trimestral, ou após releases que adicionem/removam módulos.*
