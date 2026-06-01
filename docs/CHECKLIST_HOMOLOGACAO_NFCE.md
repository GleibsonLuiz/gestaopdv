# Checklist de Homologação — NFC-e (modelo 65) · Bahia

> **Objetivo:** emitir, consultar, cancelar e inutilizar NFC-e **sem valor fiscal** no ambiente de homologação da SEFAZ-BA (via gateway), até passar 100% dos casos. Só depois liga-se produção.
> **Pré-leitura:** [PLANO_FISCAL_NFCE.md](PLANO_FISCAL_NFCE.md) (arquitetura e fases). Todo este runbook roda com `ambienteFiscal = HOMOLOGACAO` — toda nota sai com a tarja **"SEM VALOR FISCAL"**.

---

## 0. Pré-requisitos (Fase 0)

- [ ] Conta no gateway (NuvemFiscal) criada — ambiente de **homologação/sandbox**.
- [ ] `client_id` / `client_secret` obtidos.
- [ ] Empresa piloto cadastrada no gateway (CNPJ do teste — pode ser o seu).
- [ ] Certificado A1 (`.pfx` + senha) enviado ao gateway. *(NuvemFiscal/PlugNotas têm sandbox que dispensa certificado próprio — se usar, anote.)*
- [ ] CSC + ID do CSC de **homologação** obtidos no portal da SEFAZ-BA e cadastrados no gateway.

### Variáveis de ambiente (backend — Vercel ou `.env` local)
```
FISCAL_NUVEMFISCAL_CLIENT_ID=...
FISCAL_NUVEMFISCAL_CLIENT_SECRET=...
# opcionais (default ja aponta pra producao da API; troque se usar sandbox):
# FISCAL_NUVEMFISCAL_BASE_URL=https://api.sandbox.nuvemfiscal.com.br
# FISCAL_NUVEMFISCAL_AUTH_URL=https://auth.nuvemfiscal.com.br/oauth/token
```
> ⚠️ **Antes do go-live**, confira os nomes de campos da resposta da NuvemFiscal contra a doc/conta real (marcado no cabeçalho de `backend/src/lib/fiscal/nuvemfiscal.js`). Se a estrutura divergir, ajuste o `mapearResultado()`.

---

## 1. Configuração no sistema (tela Configurações › Emissão Fiscal)

Preencher e salvar:
- [ ] Provedor fiscal: **NuvemFiscal**
- [ ] Ambiente: **Homologação**
- [ ] Regime (CRT): conforme a empresa piloto (ex.: **1 — Simples Nacional**)
- [ ] Código IBGE município (ex.: Salvador = **2927408**) e UF IBGE (**29**)
- [ ] Série (ex.: **1**) e Próximo número (ex.: **1**)
- [ ] CSC + ID do CSC de homologação
- [ ] Dados de empresa/endereço completos (formulário acima — Razão social, CNPJ, IE, logradouro, nº, bairro, cidade, UF, CEP)
- [ ] Marcar **Emissão fiscal ativa** → o painel de "pendências" deve ficar **vazio**. Se listar campos faltando, complete-os.

**Cadastro de produtos do teste** (Produtos): ao menos 2-3 itens com **NCM válido (8 díg.)**, **CFOP de saída** (ex.: 5102), **origem**, e CST/CSOSN coerentes com o CRT:
- Simples Nacional → **CSOSN** (ex.: `102`); PIS/COFINS CST (ex.: `07`).
- Regime Normal → **CST ICMS** (ex.: `00` com alíquota) + PIS/COFINS (`01` com alíquota, ou `07`).

---

## 2. Verificação de conectividade

- [ ] `GET /fiscal/status-servico` → retorna `{ online: true, cStat: "107" }`.
  - Se 4xx/erro: credenciais do gateway ou CNPJ não cadastrado no provedor.

---

## 3. Casos de teste (executar no PDV → recibo → "🧾 Emitir NFC-e")

> Resultado esperado em todos: status **AUTORIZADA** (cStat **100**), DANFE imprime com QR Code e tarja de homologação.

| # | Cenário | Como montar | Esperado |
|---|---|---|---|
| 1 | Venda simples, 1 item, dinheiro, **sem consumidor** | 1 produto, pagamento Dinheiro = total | AUTORIZADA; "CONSUMIDOR NÃO IDENTIFICADO" no DANFE |
| 2 | **Vários itens** + unidade fracionária | inclua item por KG/L (qtd 1,5) | AUTORIZADA; qCom com casas decimais |
| 3 | Com **desconto** | aplique desconto na venda | AUTORIZADA; vDesc rateado, totais batem |
| 4 | **Múltiplas formas** + troco | ex.: parte dinheiro (paga a mais) + cartão | AUTORIZADA; soma pagamentos − troco = total |
| 5 | **Com CPF** do consumidor | informe CPF do cliente | AUTORIZADA; em homologação o nome vira "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO..." |
| 6 | **Cartão crédito/débito** | pagamento no cartão | AUTORIZADA (grupo `card` enviado — evita rej. 391/392) |
| 7 | **Cancelamento** | em Notas Fiscais, cancelar a nota do caso 1 (justificativa ≥15 chars) | status CANCELADA + protocolo |
| 8 | **Inutilização** | Notas Fiscais › Inutilizar (faixa pequena de nºs não usados) | linhas INUTILIZADA criadas |
| 9 | **Reimpressão / QR** | reimprimir DANFE de uma autorizada; ler o QR no celular | abre a consulta pública da NFC-e na SEFAZ-BA (homolog.) |
| 10 | **Rejeição proposital** | cadastre 1 produto com NCM inválido e emita | status REJEITADA + xMotivo; corrigir e reemitir (reusa o mesmo número) |

> O caso 10 valida o caminho de erro: a nota fica REJEITADA com o motivo visível; ao corrigir o cadastro e emitir de novo **para a mesma venda**, o sistema reaproveita a numeração (sem gerar buraco).

---

## 4. Checklist anti-rejeição (das 50 maiores — Boas Práticas)

Conferir conforme as rejeições aparecerem. Coluna "Onde corrigir":

| Rejeição | Onde corrigir no sistema |
|---|---|
| 778 NCM inexistente / 777 NCM incompleto | Cadastro do **Produto** (NCM 8 díg. válido) |
| 383/384/591 CSOSN indevido / 590 CST p/ Simples | **Produto** (CSOSN×CRT) — coerência regime |
| 382/386 CFOP × CST/CSOSN | **Produto** (CFOP de saída compatível) |
| 464/397 hash/parâmetro do QR Code | CSC/ID no **gateway** e na config; conferir ambiente |
| 767/769 total de pagamentos / grupo de pagamento | já validado localmente em `montarNfce.js`; revisar formas no PDV |
| 391/392 dados do cartão | grupo `card` já enviado p/ tPag 03/04 (`tpIntegra=2`) |
| 703/704 data-hora atrasada/futura | relógio do servidor; `dhEmi` usa `Venda.createdAt` (fuso BA −03:00) |
| 252 ambiente divergente | `ambienteFiscal` da config × ambiente do gateway |
| 611 cEAN inválido | **Produto** código de barras (ou "SEM GTIN") — já validado |
| 203 emissor não habilitado | **credenciamento** SEFAZ-BA (externo) |

Ajustes finos de tributos (CST/CSOSN menos comuns) vão em `backend/src/lib/fiscal/tributos.js`.

---

## 5. Critério de saída (pode ir para produção quando…)

- [ ] Casos 1–10 todos verdes.
- [ ] QR Code lido no celular abre a NFC-e na consulta pública (homologação).
- [ ] Cancelamento e inutilização homologados.
- [ ] Checklist anti-rejeição sem pendências recorrentes.

### Virada para produção (resumo — ver §6 do PLANO)
1. Credenciamento de **produção** na SEFAZ-BA + certificado/CSC de **produção** no gateway.
2. Config: Ambiente = **Produção**, série/numeração de produção, conferir Próximo número.
3. Emitir **1 nota real de baixo valor** (smoke test) e validar na consulta pública.
4. Atualizar `docs/MANUAL.md` + `Ajuda.tsx` (agora que está pronto).
5. Rollback disponível: **desligar "Emissão fiscal ativa"** não afeta o resto do PDV.
