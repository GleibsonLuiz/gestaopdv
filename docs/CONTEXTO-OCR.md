# Contexto: OCR de comprovante (Despesas)

> Handoff para quem for evoluir o OCR (inclusive sessão na nuvem). Estado verificado
> no código em 2026-06-14. Caminhos com `arquivo:linha` apontam o ponto exato.
> **Nada aqui é suposição de comportamento em produção** — é o que o código faz hoje
> + pendências candidatas mapeadas aos sintomas relatados.

## O que é

Ao lançar uma **Despesa**, o usuário escolhe uma foto/PDF do comprovante. O arquivo
é enviado para a IA (Claude com visão), que **sugere** os campos (valor, data,
descrição, CNPJ, categoria). O usuário **confere e confirma** — a IA **nunca grava
sozinha**. Se a leitura falhar, o fluxo cai para preenchimento manual sem travar.

## Fluxo ponta a ponta

1. **Front** — `src/Despesas.tsx`
   - `aoEscolherArquivo` (`src/Despesas.tsx:401`) dispara OCR automático ao escolher arquivo (foto **e** PDF).
   - `lerComprovante` (`src/Despesas.tsx:379`) chama a API; em sucesso, pré-preenche os campos e marca `origemOcr`; em erro, marca `ocrFalhou` (aviso discreto, sem toast global).
   - Input: `accept="image/*,application/pdf"` + `capture="environment"` (`src/Despesas.tsx:505`).
2. **API client** — `lerComprovanteOCR` (`src/lib/api.ts:895`): `multipart/form-data`, campo `arquivo`, `{ silent: true }` (não dispara o toast global de erro).
3. **Rota** — `POST /despesas/ocr` (`backend/src/routes/despesas.js:25`), protegida por `authRequired` + `requirePermissao("DESPESAS")`. Usa `upload.single("arquivo")` + `tratarErroUpload`.
4. **Controller** — `ocr` (`backend/src/controllers/despesaController.js:277`): busca as categorias analíticas de DESPESA do tenant, chama `extrairDadosComprovante`, valida o `planoContaSugeridaId` contra o tenant e devolve o JSON. **Não cria a despesa.**
5. **Motor IA** — `extrairDadosComprovante` (`backend/src/lib/claudeIA.js:99`): chama a API Anthropic via `fetch` (sem SDK), bloco `image` (base64) ou `document` (PDF base64) + prompt que exige **só JSON**. `parseJsonComprovante` (`backend/src/lib/claudeIA.js:151`) extrai/normaliza o JSON.

## Configuração crítica (a causa nº 1 de "não lê")

- **`ANTHROPIC_API_KEY`** precisa estar setada no backend (Vercel, projeto da API).
  Sem ela, `extrairDadosComprovante` lança `ClaudeIAError` e o controller responde
  **502 com `iaIndisponivel: true`** (`backend/src/controllers/despesaController.js:299`).
  → **"não consegui ler" quase sempre é config, não código.**
- Modelos (env, com fallback):
  - `ANTHROPIC_MODEL_VISION` → senão `ANTHROPIC_MODEL` → senão `claude-haiku-4-5` (`backend/src/lib/claudeIA.js:18`, `:127`).
  - Haiku 4.5 lê cupom bem e custa centavos. Para casos difíceis, considerar setar `ANTHROPIC_MODEL_VISION=claude-sonnet-4-6`.
- Timeout: 25s (`backend/src/lib/claudeIA.js:19`).

## Restrições de upload (a causa nº 1 de "rejeita a foto do celular")

`backend/src/controllers/anexoController.js`:
- **Tamanho máx: 5 MB** (`:6`). Foto de celular moderno frequentemente passa disso.
- **MIMEs aceitos: apenas `application/pdf`, `image/jpeg`, `image/jpg`, `image/png`** (`:7`).
  - **HEIC/HEIF (iPhone) NÃO está na lista** → o multer rejeita com `TIPO_NAO_PERMITIDO`
    → resposta 400 "Tipo de arquivo nao permitido (apenas PDF, JPG, PNG)" (`:35`).
  - `image/webp` também não é aceito.

## Sintomas relatados → onde olhar

| Sintoma | Causa provável | Onde / candidato de fix |
|---|---|---|
| **Rejeita a foto do celular** ("tipo não permitido" / "muito grande") | HEIC fora da lista de MIMEs e/ou >5 MB | `anexoController.js:6-10`. Candidatos: aceitar `image/heic`,`image/heif`,`image/webp`; subir limite; **ou** comprimir/converter no front antes de enviar (canvas → JPEG). A Anthropic aceita `image/jpeg|png|gif|webp` — **não** HEIC; então HEIC precisa virar JPEG de qualquer jeito. |
| **Diz que não conseguiu ler** | IA não configurada (sem `ANTHROPIC_API_KEY`) ou erro/timeout/rate-limit | Backend já loga o motivo real: `console.error("[despesa.ocr] ...")` (`despesaController.js:300`). Conferir logs da função na Vercel. O 502 traz `iaIndisponivel` mas **o front ignora essa distinção** (ver Pendências). |
| **Lê mas erra os campos** | prompt / normalização do JSON | Prompt em `claudeIA.js:110-117`; normalização (valor/data/cnpj) em `parseJsonComprovante` `claudeIA.js:151`. Ajustar instrução (ex.: formato de data BR, valor total vs. subtotal) e/ou few-shot. |
| **Não dispara nada** | wiring do front ou arquivo não chega | `aoEscolherArquivo` `Despesas.tsx:401` só chama OCR se `f` existe; conferir `onChange` `:506` e o `fileRef`. |

## Pendências / melhorias candidatas (não implementadas)

1. **Front não usa o flag `iaIndisponivel`** — em `lerComprovante` (`src/Despesas.tsx:393`) o `catch` é genérico (`ocrFalhou = true`) e sempre mostra "não consegui ler — preencha manualmente" (`:504`). O backend já distingue "IA não configurada" de "erro transitório" (`despesaController.js:301-306`), mas essa informação se perde porque `uploadForm` é `silent`/lança erro genérico. **Melhoria:** propagar `iaIndisponivel` e mostrar mensagem específica ("Leitura por IA indisponível — preencha manual" vs "Falha ao ler agora, tente de novo").
2. **HEIC/tamanho do celular** — ver tabela acima. Decisão de design: aceitar mais MIMEs no backend **vs** normalizar no front. Recomendado normalizar no front (sempre converte para JPEG e reduz < 5 MB) — resolve HEIC + tamanho de uma vez.
3. **Qualidade da extração** — avaliar trocar o modelo de visão para Sonnet em comprovantes ruins e/ou enriquecer o prompt.

## Regras do projeto a respeitar

- Atualizar `docs/MANUAL.md` se mudar campo/tela (ver memória "Atualizar manual sempre").
- Validar `npx tsc --noEmit`, `npx vite build` (front) e `node --check` (back) antes de commit.
- OCR é best-effort: **nunca** travar o lançamento manual da despesa.
