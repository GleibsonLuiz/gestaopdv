# Plano de Produção — Módulo de Emissão NFC-e (modelo 65) · Bahia

> **Criado em:** 01/junho/2026
> **Base:** documentação oficial em `manu/` (MOC 7.0, Anexo I — Leiaute/Validação, Anexo IV — Contingência NFC-e, Manual de Especificações do DANFE NFC-e + QR Code v6.0, Manual de Boas Práticas BP 2018.001, Especificação Técnica da Contingência Off-line v2.0) + análise do estado atual do projeto.
> **Decisões de arquitetura (confirmadas com o cliente):**
> 1. **Gateway fiscal** (provedor terceiro assina XML, fala SOAP com a SEFAZ, devolve XML+QR Code+DANFE). **Não** faremos integração SOAP/mTLS direta.
> 2. **Escopo: somente NFC-e (modelo 65).** NF-e 55 fica para depois.
> 3. **Certificado A1 gerenciado pelo provedor** — o `.pfx` é enviado ao gateway, nunca armazenado no nosso banco.
> **Regra do projeto:** toda mudança/feature atualiza `docs/MANUAL.md` (e `Ajuda.tsx` se tela nova) — **mas o fiscal só entra no manual quando estiver pronto/homologado.**

---

## 1. Diagnóstico — o que já existe (ETAPA 14, camada de dados pronta)

A fundação de dados está praticamente completa. **Não precisamos redesenhar o schema.**

| Item | Estado | Onde |
|---|---|---|
| Models `NotaFiscal` / `ItemNotaFiscal` | ✅ pronto | `schema.prisma` (migration `20260528000000_fiscal_nota_fiscal_emitente`) |
| Enums fiscais (`ModeloDocFiscal`, `AmbienteFiscal`, `TipoEmissaoFiscal`, `StatusSefaz`, `OrigemMercadoria`, `RegimeTributario`) | ✅ pronto | `schema.prisma` |
| Campos fiscais do **emitente** em `ConfiguracaoEmpresa` (`crt`, `cnae`, `codMunicipioIBGE`, `codUFIBGE`, `fiscalAtivo`, `ambienteFiscal`, `serieNfce`, `proximoNumeroNfce`, `cscEnc`, `cscId`, `provedorFiscal`, `certificadoRef`) | ✅ pronto | `schema.prisma` |
| Campos fiscais do **produto** (`ncm`, `cest`, `cfopPadrao`, `origem`, `cstIcms`/`csosnIcms`, `aliquotaIcms`, `cstPis`/`aliquotaPis`, `cstCofins`/`aliquotaCofins`, `unidadeTributavel`) | ✅ pronto | `schema.prisma` |
| Validações fiscais (NCM, CEST, CFOP saída, GTIN c/ DV, coerência regime×CST×CSOSN) | ✅ pronto | `lib/validacoesFiscais.js` |
| Criptografia AES-256-GCM (p/ CSC e segredos) | ✅ pronto | `lib/cripto.js` |
| Numeração contígua com proteção de corrida | ✅ pronto | `lib/proximoNumero.js` |
| Storage privado (Vercel Blob) | ✅ pronto | `lib/storage.js` |

**O que falta (foco deste plano):** motor de emissão, integração com o gateway, UI de configuração fiscal, UI de emissão/DANFE/QR Code, fluxos de cancelamento/inutilização/contingência, consulta/reimpressão — e a **fase de testes em homologação**.

---

## 2. Arquitetura escolhida (gateway fiscal)

```
PDV (venda) ──► backend (controller fiscal)
                   │  1. monta payload a partir da Venda + Produtos + ConfiguracaoEmpresa
                   │  2. calcula tributos por item (Simples Nacional / Regime Normal)
                   │  3. reserva nNF (proximoNumero) e grava NotaFiscal status=PROCESSANDO
                   ▼
             provedorFiscal (cliente HTTP) ──► GATEWAY (NuvemFiscal/Focus/PlugNotas)
                                                  │ assina XML (cert A1 do tenant)
                                                  │ valida schema + transmite SOAP à SEFAZ-BA
                                                  ▼
                                              SEFAZ-BA (homologação | produção)
                   ┌──────────────────────────────┘
                   ▼  retorno: cStat, chaveAcesso, nProt, dhRecbto, XML autorizado, QR Code, DANFE
             atualiza NotaFiscal (AUTORIZADA/REJEITADA) ──► imprime DANFE NFC-e (térmica/A4)
```

**Provedor recomendado: NuvemFiscal** (REST/JSON limpo, NFC-e BA, gerencia o `.pfx` via API, ambientes homologação/produção separados, pay-per-use). Alternativas equivalentes: **Focus NFe** e **PlugNotas**. **Manter abstração** (`provedorFiscal` no schema já prevê isso) para não acoplar o código a um fornecedor.

**Por que gateway e não direto:** o backend roda em **Vercel serverless** — assinatura ICP-Brasil (XML-DSig RSA-SHA1), mTLS com certificado de cliente e SOAP de longa duração são frágeis nesse ambiente. O gateway remove ~80% do risco técnico e leva à produção muito mais rápido. Custo: ~R$0,05–0,15/nota (varia por provedor/volume).

---

## 3. Pré-requisitos (administrativos/legais — bloqueiam a emissão real, não o código)

> Estes itens **podem ser preparados em paralelo** ao desenvolvimento, mas são obrigatórios antes do go-live. A maioria é do **cliente/contador**, não nossa.

1. **Credenciamento como emissor de NFC-e na SEFAZ-BA** — solicitado no portal da SEFAZ Bahia. Sem isso a SEFAZ rejeita ("Emissor não habilitado").
2. **Certificado digital A1** (ICP-Brasil, arquivo `.pfx` + senha) do emitente. A1 é o indicado para varejo (A3 em token é inviável no PDV — confirma o Manual de Boas Práticas, item 8).
3. **CSC (Código de Segurança do Contribuinte) + ID do CSC** — gerado no portal da SEFAZ-BA. **Há CSC de homologação e CSC de produção (diferentes).** Usado no hash do QR Code (v2.00). *Obs.: QR Code v3.00 dispensa CSC, mas a BA opera v2.00 — confirmar a versão vigente no Portal Nacional NFC-e antes de codar o hash.*
4. **Conta no gateway fiscal** (homologação primeiro) + chave de API. Upload do `.pfx` e do CSC para o gateway.
5. **Cadastro fiscal correto dos produtos** — NCM válido (a rejeição #2 nacional é "NCM inexistente"), CFOP de saída, CST/CSOSN coerentes com o CRT, origem. Já temos os campos e validações; falta **garantir o preenchimento** (auditoria de cadastro).

---

## 4. Fases de implementação (passo a passo)

> **Progresso (01/jun/2026):** Fases 1–6 implementadas e verificadas (typecheck + build + smoke test). **Falta apenas:** Fase 0 (conta no gateway/credenciais + empresa/CSC no provedor) e a **fase de testes em homologação** (com ajuste fino dos tributos). Contingência off-line automática (5.3) fica como follow-up — hoje há a consulta de status do serviço (`GET /fiscal/status-servico`) para consciência de SEFAZ offline.

### 🟢 Fase 0 — Provedor e ambiente de homologação · ~2 dias
- **0.1** Criar conta no gateway (homologação), obter API key. Guardar como **env var** no Vercel (`FISCAL_NUVEMFISCAL_API_KEY` etc.) — segredo de plataforma, não por tenant.
- **0.2** Subir no gateway o **certificado A1 de teste** e o **CSC de homologação** do emitente piloto.
- **0.3** Ler a doc do endpoint de NFC-e do provedor e mapear os campos do payload ↔ nossos models (planilha de-para). **Ponto crítico**: garantir que o provedor cobre **cancelamento**, **inutilização** e **consulta de status** (todos previstos no MOC §5).

### 🟢 Fase 1 — Configuração fiscal do emitente (UI + backend) · ~3-4 dias
Tudo grava em `ConfiguracaoEmpresa` (campos já existem).
- **1.1** Endpoints em `configuracaoController.js`: `GET/PUT` da seção fiscal. **Nunca** retornar `cscEnc` decifrado — mascarar (mesmo padrão do `mpAccessTokenEnc`). Cifrar CSC com `lib/cripto.js`.
- **1.2** Tela em `Configuracoes.tsx` (aba "Fiscal / NFC-e"): CRT, IE, CNAE, código IBGE município/UF, série, próximo número, ambiente (Homologação/Produção), seleção do provedor, campos de CSC/ID, upload do certificado (envia direto ao gateway → grava só `certificadoRef`), e o toggle `fiscalAtivo`.
- **1.3** Validação de "prontidão fiscal": função que checa se todos os campos obrigatórios do emitente estão preenchidos antes de permitir `fiscalAtivo=true`.

### 🟢 Fase 2 — Camada de provedor (abstração + cliente HTTP) · ~3 dias
- **2.1** `lib/fiscal/provedor.js` — interface comum: `emitirNfce(payload)`, `consultarNfce(ref)`, `cancelarNfce(ref, justificativa)`, `inutilizarNumeracao(...)`, `consultarStatusServico()`.
- **2.2** `lib/fiscal/nuvemfiscal.js` (implementação concreta). Selecionado por `ConfiguracaoEmpresa.provedorFiscal`. Trata timeout (Boas Práticas §28: 20–50s, com retry limitado — **nunca** loop, §27), idempotência via `idIntegracaoProvedor`.
- **2.3** Tratamento de erros padronizado (mapear cStat/mensagens do gateway para `cStat`/`xMotivo`/`mensagemErro` da `NotaFiscal`).

### 🟢 Fase 3 — Motor de emissão (venda → NFC-e autorizada) · ~5-7 dias  ⬅ núcleo
- **3.1** `lib/fiscal/montarNfce.js` — transforma `Venda`+`ItemVenda`+`VendaPagamento`+`Cliente`+`ConfiguracaoEmpresa` no payload do gateway. Regras NFC-e do Anexo IV/MOC: `mod=65`, `idDest=1`, `indFinal=1`, `indPres=1`, `tpAmb` da config, `indSinc=1` (resposta síncrona — Boas Práticas §31).
- **3.2** `lib/fiscal/tributos.js` — cálculo por item conforme regime:
  - Simples Nacional (CRT 1/2) → **CSOSN**; Regime Normal (CRT 3) → **CST ICMS**.
  - PIS/COFINS sempre presentes (CST + valor, pode ser 0).
  - `vTotTrib` (Lei 12.741/2012) opcional, informativo.
  - Validações locais espelhando as 50 maiores rejeições (vProd = vUnCom×qCom; total de pagamentos = total da nota para NFC-e §767/769; BC×alíquota; CFOP×CST/CSOSN).
- **3.3** `fiscalController.js` + `routes/fiscal.js` (registrar no `server.js` como `/fiscal`):
  - `POST /fiscal/nfce` (emitir a partir de `vendaId`): reserva `nNF` via `proximoNumero.js`, grava `NotaFiscal` status=`PROCESSANDO`, chama provedor síncrono, atualiza para `AUTORIZADA`/`REJEITADA`, persiste `chaveAcesso`, `protocolo`, `dataAutorizacao`, `digestValue`, `qrCode`, `urlConsulta`, `xmlAutorizado`, totais e snapshot dos itens (`ItemNotaFiscal`).
  - Idempotência: se a venda já tem nota autorizada, não reemitir.
  - **Importante (timeout serverless):** emissão síncrona pode levar até ~30s; configurar timeout adequado na função Vercel e tratar resposta pendente (consultar status depois) para não duplicar nota.
- **3.4** Regra de negócio (Boas Práticas §19): **não** permitir "fechar venda fiscal" sem gerar a NFC-e (ou contingência). PDV deve deixar claro o status fiscal da venda.

### 🟢 Fase 4 — DANFE NFC-e + QR Code + entrega ao consumidor · ~4-5 dias
Segue o **Manual de Especificações do DANFE NFC-e v6.0**.
- **4.1** DANFE NFC-e (cupom térmico 56mm+ e opção A4) com as 9 divisões: cabeçalho (CNPJ/razão/endereço), itens (cProd, xProd, qCom, uCom, vUnCom, vProd), totais (qtd itens, valor total, acréscimos/desconto, valor a pagar, formas de pagamento, troco), chave de acesso em 11 blocos de 4, **QR Code ≥25×25mm**, dados do consumidor, identificação da NFC-e + protocolo, área de mensagem fiscal, mensagem do contribuinte.
- **4.2** QR Code: usar o `qrCode`/`urlConsulta` devolvidos pelo gateway (ele já calcula o hash com o CSC). Se o provedor **não** devolver, implementar hash v2.00 SHA-1 conforme §4.3 do manual (online: concatenar chave|versão|tpAmb|idCSC + CSC → SHA-1 hex). Renderizar imagem nível de correção **M**, UTF-8.
- **4.3** Homologação: imprimir obrigatoriamente **"EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO – SEM VALOR FISCAL"** (manual §3.1.8).
- **4.4** Entrega: tela do caixa por padrão, com opções imprimir / e-mail / (futuro) só chave (Boas Práticas §13; DANFE manual §4.7). Integrar com `configuracaoImpressoraController`.

### 🟡 Fase 5 — Eventos: cancelamento, inutilização, contingência · ~4-5 dias
- **5.1** **Cancelamento** (evento, MOC §5.9): `POST /fiscal/nfce/:id/cancelar` com justificativa (≥15 chars), dentro do prazo legal. Persistir `dataCancelamento`, `justificativaCancelamento`, `protocoloCancelamento`, `xmlCancelamento`, status=`CANCELADA`.
- **5.2** **Inutilização** de numeração (MOC §5.3): `POST /fiscal/inutilizar` para "buracos" na sequência. NFC-e emitida em contingência **não** pode ser inutilizada (Boas Práticas §18).
- **5.3** **Contingência off-line** (`tpEmis=9`, Anexo IV) — *avaliar necessidade*: gera/assina/imprime DANFE sem autorização prévia e transmite até o fim do 1º dia útil seguinte. Fila "NFC-e pendente de retorno" (Boas Práticas §29-30). **Sugestão:** entregar como sub-fase posterior — depende de suporte do gateway e a regra é "exceção" (§15). Mínimo p/ go-live: detectar SEFAZ fora do ar e **bloquear/avisar** com clareza, sem ainda automatizar a contingência.

### 🟢 Fase 6 — Consulta, histórico e reimpressão · ~2-3 dias
- **6.1** Tela "Notas Fiscais" (nova `NotasFiscais.tsx` + `Ajuda.tsx`): lista com filtros (status, período), motivo da rejeição visível até correção (Boas Práticas §10/22), ações reimprimir DANFE, baixar XML, cancelar.
- **6.2** Exportação de XML (nota + retorno) para contabilidade (Boas Práticas §25).
- **6.3** Endpoint de consulta de status na SEFAZ via gateway (reconciliar notas `PROCESSANDO` órfãs de timeout).

---

## 5. 🧪 Fase de TESTES em HOMOLOGAÇÃO ("o sistema deles") — antes da produção

> Objetivo: emitir, cancelar e inutilizar NFC-e **sem valor fiscal** no ambiente de homologação da SEFAZ-BA (via gateway) até passar 100% dos casos. Uso exaustivo recomendado (Boas Práticas §2). **Toda nota de teste sai com a tarja "SEM VALOR FISCAL".**

**Pré-condições:** Fases 0–4 prontas; `ambienteFiscal=HOMOLOGACAO`; CSC e certificado de teste no gateway; produtos do piloto com NCM/CFOP/CST corretos.

**Roteiro de casos (mínimo):**
1. Venda simples, 1 item, dinheiro, **consumidor não identificado** → autorizada (cStat 100).
2. Venda com **vários itens** e unidades fracionárias (KG/L).
3. Venda com **desconto** e com **acréscimo** (frete/outras despesas).
4. **Múltiplas formas de pagamento** + troco (validar total pagamentos = total nota, §767/769).
5. Venda **com CPF/CNPJ do consumidor**; e venda ≥ R$10.000 (identificação obrigatória).
6. **Cancelamento** de uma nota autorizada (dentro do prazo).
7. **Inutilização** de uma faixa de numeração.
8. Produto **Simples Nacional (CSOSN)** vs **Regime Normal (CST)** — conforme o CRT do emitente.
9. Reimpressão de DANFE e leitura do **QR Code** apontando para a consulta pública da SEFAZ-BA.
10. **Rejeições proposital** para validar tratamento de erro (ex.: NCM inválido) e correção+reenvio (§22).

**Checklist anti-rejeição** (das 50 maiores — Boas Práticas, Anexo Único):
- [ ] NCM existente e completo (#2, #22, #777/778)
- [ ] CSOSN/CST coerente com o CRT (#5, #35, #590/591)
- [ ] CFOP permitido para o CST/CSOSN (#9, #382/386)
- [ ] Hash do QR Code = calculado pela SEFAZ (#6, #464) e parâmetros do QR conferem (#7, #397)
- [ ] Somatórios batem (produto, desconto, BC ICMS, PIS, COFINS, total NF) (#11–14, #20–21…)
- [ ] Grupo de Formas de Pagamento presente (#23, #769); dados de cartão quando aplicável (#32, #391)
- [ ] Data-hora de emissão não atrasada/futura (#8, #18, #703/704)
- [ ] cEAN/GTIN válido (#25, #611) — já validado em `validacoesFiscais.js`
- [ ] Ambiente informado = ambiente de recebimento (#44, #252)
- [ ] QR Code presente no XML (grupo ZX / #43, #394)

**Critério de saída:** todos os casos 1–10 verdes + checklist 100% + leitura do QR Code retornando a NFC-e na consulta pública de homologação.

---

## 6. Go-live em produção (checklist)

1. Cliente **credenciado** na SEFAZ-BA para produção. ✅ pré-requisito §3.1
2. Certificado A1 **de produção** + **CSC de produção** subidos no gateway (são diferentes dos de homologação).
3. `ConfiguracaoEmpresa`: `ambienteFiscal=PRODUCAO`, série/numeração de produção, `fiscalAtivo=true`.
4. **Numeração:** confirmar `serieNfce`/`proximoNumeroNfce` corretos (produção começa "do zero" da série escolhida — não reaproveitar numeração de homologação).
5. Emitir **1 nota real de baixo valor** como smoke test, conferir na consulta pública da SEFAZ-BA, depois liberar para o caixa.
6. Monitorar primeiras horas (status `PROCESSANDO`/`REJEITADA`), alertas de erro.
7. Atualizar `docs/MANUAL.md` + `Ajuda.tsx` (regra do projeto — só **agora** que está pronto).
8. Plano de rollback: `fiscalAtivo=false` desliga emissão sem afetar o resto do PDV.

---

## 7. Considerações transversais

- **Multi-tenant:** cada `Empresa` tem seu próprio certificado (no gateway), CSC, série e numeração. Nada de numeração/certificado compartilhado. A API key do gateway é da plataforma; o vínculo com o tenant é o `certificadoRef`/conta no provedor.
- **Segurança/LGPD:** CSC cifrado (AES-256-GCM, `lib/cripto.js`), nunca exposto decifrado em GET. `.pfx` e senha **não** ficam no nosso banco (decisão: gerenciado pelo provedor). Logar emissões na auditoria (`middlewares/auditoria.js`).
- **Vercel serverless:** emissão síncrona pode encostar no timeout; configurar limite adequado e ter o caminho "consultar status depois" para não duplicar nota. Numeração protegida contra corrida (`lib/proximoNumero.js`).
- **Custos:** pay-per-nota no gateway — expor no painel admin-master se for repassar por tenant/plano.
- **Performance/estabilidade:** respeitar Boas Práticas §27 (nunca reenviar em loop após rejeição) e §28 (timeout 20–50s com no máx. ~3 tentativas).
- **Dependência nova provável:** apenas um gerador de **QR Code** e de **PDF/render do DANFE** no frontend ou backend (avaliar reuso do que já existe em impressão). O gateway cobre assinatura/SOAP.

---

## 8. Mapa de arquivos (criar / alterar)

**Backend — criar:**
- `backend/src/lib/fiscal/provedor.js` (interface)
- `backend/src/lib/fiscal/nuvemfiscal.js` (implementação)
- `backend/src/lib/fiscal/montarNfce.js` (venda → payload)
- `backend/src/lib/fiscal/tributos.js` (cálculo por regime)
- `backend/src/controllers/fiscalController.js`
- `backend/src/routes/fiscal.js`

**Backend — alterar:**
- `backend/src/server.js` (registrar `/fiscal`)
- `backend/src/controllers/configuracaoController.js` (seção fiscal do emitente, mascarar CSC)
- `backend/src/controllers/vendaController.js` / `pdvController.js` (gatilho de emissão; status fiscal da venda)

**Frontend — criar:**
- `src/NotasFiscais.tsx` (consulta/histórico/reimpressão)
- componente DANFE NFC-e (cupom) + QR Code

**Frontend — alterar:**
- `src/Configuracoes.tsx` (aba Fiscal/NFC-e)
- tela do PDV (botão/estado "Emitir NFC-e", status, DANFE)
- `src/Ajuda.tsx` e `docs/MANUAL.md` (**somente no go-live**)
- `src/lib/api.ts` (novas chamadas)

**Schema:** sem migração nova prevista (camada já existe). Eventual ajuste pontual se o de-para com o gateway revelar campo faltante.

---

## 9. Cronograma estimado

| Fase | Duração | Depende de |
|---|---|---|
| 0 — Provedor/homologação | ~2 dias | conta no gateway, cert+CSC de teste |
| 1 — Config fiscal (UI+API) | ~3-4 dias | — |
| 2 — Camada de provedor | ~3 dias | 0 |
| 3 — Motor de emissão | ~5-7 dias | 1, 2 |
| 4 — DANFE + QR Code | ~4-5 dias | 3 |
| **🧪 Testes homologação** | **~3-5 dias** | **0-4 + pré-req §3** |
| 5 — Eventos (cancel/inut/conting.) | ~4-5 dias | 3, 4 |
| 6 — Consulta/histórico | ~2-3 dias | 3 |
| Go-live produção | ~1-2 dias | credenciamento + cert/CSC produção |

**Caminho mínimo para começar os testes de emissão em homologação:** Fases 0 → 1 → 2 → 3 → 4 (≈ 3 semanas de dev), e então a fase de testes. Cancelamento/inutilização (Fase 5) podem ser desenvolvidos durante/após a homologação inicial das emissões.

---

### Próximo passo imediato
Abrir conta no **gateway fiscal** (homologação) e subir o **certificado A1 de teste + CSC de homologação** do emitente piloto (Fase 0). Em paralelo, eu já posso começar a **Fase 1** (configuração fiscal — UI + backend), que não depende de nada externo.
