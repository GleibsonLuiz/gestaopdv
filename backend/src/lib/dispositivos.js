// ============ CONTROLE DE LICENCA POR MAQUINA (DISPOSITIVOS) ============
//
// Limita quantos navegadores/computadores distintos podem ter sessao ativa por
// empresa (licenca por "seat"). O frontend gera um fingerprint (UUID persistido)
// e o envia no header X-Device-Id; aqui validamos/registramos esse device no
// login e verificamos a cada boot (/auth/me) se ele continua liberado.
//
// IMPORTANTE: todas as operacoes usam prismaRaw com tenantId EXPLICITO. No login
// ainda nao ha contexto de tenant (AsyncLocalStorage), e no admin-master a
// operacao e cross-tenant. Por isso Dispositivo NAO entra em MODELOS_COM_TENANT.

import { prismaRaw } from "./prisma.js";

// Limites defensivos para nao gravar lixo vindo do header (que e controlado
// pelo cliente). O fingerprint legitimo e um UUID (~36 chars); aceitamos uma
// folga para formatos alternativos, mas recusamos valores absurdos.
const FINGERPRINT_MAX = 128;
const FINGERPRINT_MIN = 8;
const NOME_MAX = 80;
const UA_MAX = 400;

// Normaliza/valida o fingerprint recebido no header. Retorna null quando
// ausente ou fora dos limites — nesse caso o login segue SEM enforcement
// (fail-open), evitando travar frontends antigos durante o rollout.
function normalizarFingerprint(valor) {
  if (typeof valor !== "string") return null;
  const fp = valor.trim();
  if (fp.length < FINGERPRINT_MIN || fp.length > FINGERPRINT_MAX) return null;
  // So caracteres seguros de um UUID/slug (sem espacos/controle).
  if (!/^[A-Za-z0-9._:-]+$/.test(fp)) return null;
  return fp;
}

// Extrai os metadados do dispositivo a partir dos headers da request. O front
// envia X-Device-Id (fingerprint) e X-Device-Name (rotulo amigavel). O IP vem
// do proxy (Vercel) via x-forwarded-for, com fallback para o socket.
export function lerDispositivoDaRequest(req) {
  const fingerprint = normalizarFingerprint(
    req.headers["x-device-id"] || req.headers["x-device-fingerprint"],
  );
  const nomeBruto = req.headers["x-device-name"];
  const nome = typeof nomeBruto === "string" && nomeBruto.trim()
    ? decodeURIComponent(nomeBruto).trim().slice(0, NOME_MAX)
    : null;
  const userAgent = typeof req.headers["user-agent"] === "string"
    ? req.headers["user-agent"].slice(0, UA_MAX)
    : null;
  const xff = req.headers["x-forwarded-for"];
  const ip = (typeof xff === "string" && xff.split(",")[0].trim())
    || req.ip
    || req.socket?.remoteAddress
    || null;
  return { fingerprint, nome, userAgent, ip };
}

// Projecao enxuta de um device para devolver ao front (tela de bloqueio /
// painel). Nunca expoe campos internos sensiveis.
function publico(d) {
  return {
    id: d.id,
    nome: d.nome,
    ultimoAcessoEm: d.ultimoAcessoEm,
    primeiroAcessoEm: d.primeiroAcessoEm,
    ultimoIp: d.ultimoIp,
    ativo: d.ativo,
  };
}

// Valida e registra o dispositivo no momento do login.
//
// Retorna:
//   { liberado: true,  dispositivo }                       -> segue o login
//   { liberado: false, max, dispositivos: [...] }          -> bloqueia (limite)
//
// Regras:
//   - sem fingerprint            -> libera (fail-open, sem registrar);
//   - maxDispositivos null       -> ilimitado: registra/atualiza e libera;
//   - device existente e ativo   -> "touch" (ultimoAcessoEm/ip/user) e libera;
//   - device novo OU revogado    -> conta ativos; se < max, registra/reativa e
//                                   libera; senao bloqueia com a lista atual.
export async function validarLoginDispositivo({ tenantId, userId, fingerprint, nome, userAgent, ip }) {
  if (!fingerprint) return { liberado: true, dispositivo: null };

  const empresa = await prismaRaw.empresa.findUnique({
    where: { id: tenantId },
    select: { maxDispositivos: true },
  });
  const max = empresa?.maxDispositivos ?? null;

  const existente = await prismaRaw.dispositivo.findUnique({
    where: { tenantId_fingerprint: { tenantId, fingerprint } },
  });

  // Sem limite definido: apenas mantemos o inventario atualizado (registra o
  // device, reativa se preciso) e liberamos.
  if (max == null) {
    const dispositivo = await registrarOuAtualizar({ existente, tenantId, userId, fingerprint, nome, userAgent, ip });
    return { liberado: true, dispositivo: publico(dispositivo) };
  }

  // Device ja conhecido e ativo: so um "touch".
  if (existente && existente.ativo) {
    const dispositivo = await prismaRaw.dispositivo.update({
      where: { id: existente.id },
      data: { ultimoAcessoEm: new Date(), ultimoIp: ip, userId, nome: nome || existente.nome },
    });
    return { liberado: true, dispositivo: publico(dispositivo) };
  }

  // Device novo ou revogado: precisa de vaga.
  const ativos = await prismaRaw.dispositivo.count({ where: { tenantId, ativo: true } });
  if (ativos >= max) {
    const dispositivos = await prismaRaw.dispositivo.findMany({
      where: { tenantId, ativo: true },
      orderBy: { ultimoAcessoEm: "desc" },
    });
    return { liberado: false, max, dispositivos: dispositivos.map(publico) };
  }

  const dispositivo = await registrarOuAtualizar({ existente, tenantId, userId, fingerprint, nome, userAgent, ip });
  return { liberado: true, dispositivo: publico(dispositivo) };
}

// Cria o device (ou reativa/atualiza um existente) marcando-o como ativo.
async function registrarOuAtualizar({ existente, tenantId, userId, fingerprint, nome, userAgent, ip }) {
  const agora = new Date();
  if (existente) {
    return prismaRaw.dispositivo.update({
      where: { id: existente.id },
      data: {
        ativo: true,
        revogadoPor: null,
        revogadoEm: null,
        ultimoAcessoEm: agora,
        ultimoIp: ip,
        userId,
        nome: nome || existente.nome,
        userAgent: userAgent || existente.userAgent,
      },
    });
  }
  return prismaRaw.dispositivo.create({
    data: {
      tenantId, userId, fingerprint, nome, userAgent,
      ultimoIp: ip, ativo: true,
      primeiroAcessoEm: agora, ultimoAcessoEm: agora,
    },
  });
}

// Verificacao leve no boot/refresh (/auth/me): o device do JWT (claim `did`)
// ainda esta ativo? Se foi revogado pelo admin, devolvemos false para o
// front deslogar. Tambem faz um "touch" do ultimoAcessoEm quando ativo.
// Retorna true tambem quando nao ha `did` (tokens antigos) ou o device sumiu
// do banco — fail-open para nao deslogar ninguem por inconsistencia de dados.
export async function dispositivoSegueAtivo(dispositivoId, ip) {
  if (!dispositivoId) return true;
  const d = await prismaRaw.dispositivo.findUnique({
    where: { id: dispositivoId },
    select: { id: true, ativo: true },
  });
  if (!d) return true;
  if (!d.ativo) return false;
  // Touch best-effort (nao bloqueia a request se falhar).
  prismaRaw.dispositivo
    .update({ where: { id: d.id }, data: { ultimoAcessoEm: new Date(), ultimoIp: ip } })
    .catch(() => {});
  return true;
}

// Lista os dispositivos de uma empresa (painel admin-master). Ativos primeiro,
// mais recentes no topo.
export async function listarDispositivos(tenantId) {
  const linhas = await prismaRaw.dispositivo.findMany({
    where: { tenantId },
    orderBy: [{ ativo: "desc" }, { ultimoAcessoEm: "desc" }],
    include: { user: { select: { id: true, nome: true, email: true } } },
  });
  return linhas.map(d => ({ ...publico(d), revogadoEm: d.revogadoEm, revogadoPor: d.revogadoPor, user: d.user }));
}

// Revoga (libera a vaga) um dispositivo. `por` = "ADMIN" | "CLIENTE".
// Retorna o device revogado ou null se nao existir naquele tenant.
export async function revogarDispositivo({ tenantId, dispositivoId, por }) {
  const d = await prismaRaw.dispositivo.findFirst({
    where: { id: dispositivoId, tenantId },
    select: { id: true, ativo: true },
  });
  if (!d) return null;
  return prismaRaw.dispositivo.update({
    where: { id: d.id },
    data: { ativo: false, revogadoPor: por || "ADMIN", revogadoEm: new Date() },
  });
}
