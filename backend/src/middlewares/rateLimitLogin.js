// Rate limit do endpoint de login, persistido no Postgres.
//
// Por que no banco e nao em memoria: na Vercel (serverless/Fluid) cada
// instancia tem seu proprio processo, entao um Map em memoria nao e
// compartilhado nem sobrevive a reciclagem — o limite ficava inefetivo.
// A tabela login_throttle e global (fora do multi-tenant).
//
// Duas chaves sao contadas em paralelo:
//   - "ip:<addr>"    — limita rajadas de um mesmo IP (spray de varias contas)
//   - "email:<addr>" — limita brute-force contra UMA conta. Esta e a defesa
//                      robusta: o atacante nao consegue trocar o email-alvo,
//                      enquanto o IP (via X-Forwarded-For) e falsificavel.
//
// O middleware so CHECA bloqueio ativo. O registro de falha/sucesso e feito
// pelo authController de forma AGUARDADA (await) — em serverless, trabalho
// disparado em res.on("finish") apos a resposta pode nao executar.

import { prismaRaw } from "../lib/prisma.js";

const WINDOW_MS = 15 * 60 * 1000;   // janela de contagem
const MAX_TENTATIVAS = 10;          // falhas permitidas na janela
const BLOQUEIO_MS = 15 * 60 * 1000; // duracao do bloqueio ao estourar

function obterIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "desconhecido";
}

function chavesDe(req) {
  const chaves = [`ip:${obterIp(req)}`];
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (email) chaves.push(`email:${email}`);
  return chaves;
}

// Middleware: bloqueia (429) se IP OU email estiver com bloqueio ativo.
// Fail-open se o banco falhar — o proprio login ja depende do banco, entao
// nao faz sentido o limitador virar um ponto de indisponibilidade extra.
export async function rateLimitLogin(req, res, next) {
  try {
    const agora = new Date();
    const regs = await prismaRaw.loginThrottle.findMany({
      where: { chave: { in: chavesDe(req) }, bloqueadoAte: { gt: agora } },
    });
    if (regs.length > 0) {
      const ate = regs.reduce((m, r) => (r.bloqueadoAte > m ? r.bloqueadoAte : m), regs[0].bloqueadoAte);
      const segundos = Math.ceil((ate.getTime() - agora.getTime()) / 1000);
      res.set("Retry-After", String(segundos));
      return res.status(429).json({
        erro: `Muitas tentativas de login. Tente novamente em ${segundos} segundos.`,
      });
    }
    next();
  } catch {
    next();
  }
}

// Conta uma falha de credencial para IP e email. Reinicia a janela quando
// ela expira; bloqueia ao atingir MAX_TENTATIVAS. Best-effort (nunca lanca).
export async function registrarFalhaLogin(req) {
  try {
    const agora = new Date();
    for (const chave of chavesDe(req)) {
      const reg = await prismaRaw.loginThrottle.findUnique({ where: { chave } });
      const dentroJanela = reg && (agora.getTime() - reg.janelaInicio.getTime()) < WINDOW_MS;
      const tentativas = dentroJanela ? reg.tentativas + 1 : 1;
      const janelaInicio = dentroJanela ? reg.janelaInicio : agora;
      const bloqueadoAte = tentativas >= MAX_TENTATIVAS
        ? new Date(agora.getTime() + BLOQUEIO_MS)
        : null;
      await prismaRaw.loginThrottle.upsert({
        where: { chave },
        update: { tentativas, janelaInicio, bloqueadoAte },
        create: { chave, tentativas, janelaInicio, bloqueadoAte },
      });
    }
  } catch { /* best-effort: nao impede o fluxo de login */ }
}

// Limpa os contadores apos um login bem-sucedido. Best-effort.
export async function limparThrottleLogin(req) {
  try {
    await prismaRaw.loginThrottle.deleteMany({ where: { chave: { in: chavesDe(req) } } });
  } catch { /* best-effort */ }
}
