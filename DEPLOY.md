# Deploy na Vercel — passo a passo

Guia para colocar o GestãoPRO no ar com **zero custo** (plano Hobby da Vercel + Neon free tier). Para 2 funcionários com uso baixo, cabe folgado nos limites grátis.

## Arquitetura

```
Frontend (Vite)   →  https://gestao-pdv.vercel.app           ← projeto Vercel #1
Backend (Express) →  https://gestao-pdv-api.vercel.app       ← projeto Vercel #2
Banco             →  Neon Postgres (já existente)
Uploads           →  Vercel Blob (auto-conectado ao backend)
```

São **dois projetos Vercel apontando para o MESMO repositório** do GitHub. Cada um aponta para uma pasta diferente.

---

## Pré-requisitos

- Conta no [GitHub](https://github.com) com este repositório (✓ já tem: `GleibsonLuiz/gestaopdv`)
- Conta na [Vercel](https://vercel.com) — clica em **Sign up with GitHub**, autoriza, pronto. **Não pede cartão.**

---

## Passo 1 — Criar o projeto do **BACKEND**

1. Acesse https://vercel.com/new
2. Em "Import Git Repository", escolha o repositório `gestaopdv`. Clique em **Import**.
3. Configure assim:
   - **Project Name:** `gestao-pdv-api` (ou outro nome livre)
   - **Framework Preset:** `Other`
   - **Root Directory:** clique em **Edit** e selecione `backend`
   - **Build Command:** deixar em branco (ou `npm install`)
   - **Output Directory:** deixar em branco
   - **Install Command:** deixar o padrão
4. Em **Environment Variables**, adicione:

   | Nome | Valor |
   |---|---|
   | `DATABASE_URL` | a mesma URL do Neon que está no seu `.env` local |
   | `JWT_SECRET` | uma frase aleatória longa (ex: `troque-isso-por-uma-string-aleatoria-de-pelo-menos-32-chars`) |
   | `FRONTEND_URL` | `*` (vamos restringir depois, no Passo 3) |

5. Clique em **Deploy**. Vai falhar a primeira vez porque ainda não conectamos o Blob — não tem problema.

### 1.1 Conectar Vercel Blob ao backend

1. No painel do projeto recém-criado → aba **Storage**
2. Clique em **Create Database** → escolha **Blob** → dê um nome (ex: `gestao-uploads`)
3. Confirme. A Vercel automaticamente injeta a variável `BLOB_READ_WRITE_TOKEN` neste projeto.
4. Volte na aba **Deployments** → clique nos `...` do último deploy → **Redeploy**.
5. Aguarde ficar verde. Anote a URL — algo como `https://gestao-pdv-api.vercel.app`

### 1.2 Testar o backend

Abra a URL no navegador. Deve aparecer:
```json
{ "nome": "Gestao + PDV API", "versao": "1.0.0", "status": "online" }
```

Acesse `URL/health` para ver `{ "status": "ok", "timestamp": "..." }`. Funcionando ✅.

---

## Passo 2 — Criar o projeto do **FRONTEND**

1. Volte em https://vercel.com/new
2. Importe **o mesmo repositório** `gestaopdv` outra vez.
3. Configure:
   - **Project Name:** `gestao-pdv` (esse vira o subdomínio: `gestao-pdv.vercel.app`)
   - **Framework Preset:** `Vite` (a Vercel detecta sozinha)
   - **Root Directory:** deixar `.` (raiz)
4. Em **Environment Variables**:

   | Nome | Valor |
   |---|---|
   | `VITE_API_URL` | a URL do backend do Passo 1 (ex: `https://gestao-pdv-api.vercel.app`) — **sem barra no final** |

5. Clique em **Deploy**. Aguarde ficar verde.
6. Anote a URL do frontend (ex: `https://gestao-pdv.vercel.app`).

---

## Passo 3 — Restringir o CORS do backend

Volta no projeto do backend (`gestao-pdv-api`):

1. Aba **Settings** → **Environment Variables**
2. Edita a variável `FRONTEND_URL` — troca o `*` pela URL do frontend (ex: `https://gestao-pdv.vercel.app`).
3. Aba **Deployments** → último deploy → `...` → **Redeploy**.

Pronto. Só o frontend pode chamar o backend agora.

---

## Pronto para usar 🎉

Acesse `https://gestao-pdv.vercel.app` (sua URL do frontend).

- Login: `admin@gestaopro.local` / `admin123` (seed inicial — **troque essa senha!**)
- Refaça o upload do logotipo da empresa em **Empresa**

A partir daqui, cada `git push` na branch `main` redeployar **automaticamente** os dois projetos.

---

## Solução de problemas

**Erro CORS no console do navegador**
→ Confirma que `FRONTEND_URL` no backend bate exato com a URL onde você está (sem barra final, com `https://`).

**Erro 401 ou backend retorna HTML em vez de JSON**
→ A `VITE_API_URL` no frontend está errada. Verifica em Settings → Env Vars → faz redeploy.

**Erro ao subir logotipo/imagem**
→ Confirma que o **Blob** foi criado e conectado no projeto do backend (Passo 1.1). Verifica se a env `BLOB_READ_WRITE_TOKEN` aparece em Settings → Env Vars.

**"Invalid `prisma.xxx.findMany()` invocation"**
→ Falta rodar `prisma generate` no build. Adiciona no `backend/package.json`:
```json
"scripts": {
  "build": "prisma generate"
}
```
e faz redeploy.

**Backend dorme / primeiro acesso lento**
→ É normal no plano Hobby (cold start). Após o primeiro request fica quente por alguns minutos. Para 2 usuários, imperceptível.

---

## Custo mensal previsto

| Serviço | Limite Hobby grátis | Seu uso estimado |
|---|---|---|
| Vercel Functions (backend) | 100 GB-hora/mês | ~2 GB-hora |
| Vercel Bandwidth (frontend) | 100 GB/mês | <1 GB |
| Vercel Blob (uploads) | 1 GB armazenamento + 10 GB bandwidth | <100 MB |
| Neon Postgres | 0.5 GB armazenamento + branches | <50 MB |

**Total: R$ 0,00/mês** indefinidamente, enquanto não escalar.
