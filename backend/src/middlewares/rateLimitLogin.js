// Rate limit em memoria para o endpoint de login.
// Janela deslizante: max N tentativas dentro de WINDOW_MS por IP.
// Em caso de bloqueio, retorna 429 com Retry-After (segundos restantes).
// O contador eh limpo apos um login bem-sucedido (status 2xx).

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_TENTATIVAS = 10;
const BLOQUEIO_MS = 15 * 60 * 1000; // 15 minutos de bloqueio quando estourar

const tentativasPorIp = new Map();

function obterIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "desconhecido";
}

export function rateLimitLogin(req, res, next) {
  const ip = obterIp(req);
  const agora = Date.now();
  const reg = tentativasPorIp.get(ip) || { tentativas: [], bloqueadoAte: 0 };

  if (reg.bloqueadoAte > agora) {
    const segundos = Math.ceil((reg.bloqueadoAte - agora) / 1000);
    res.set("Retry-After", String(segundos));
    return res.status(429).json({
      erro: `Muitas tentativas de login. Tente novamente em ${segundos} segundos.`,
    });
  }

  reg.tentativas = reg.tentativas.filter(t => agora - t < WINDOW_MS);

  if (reg.tentativas.length >= MAX_TENTATIVAS) {
    reg.bloqueadoAte = agora + BLOQUEIO_MS;
    tentativasPorIp.set(ip, reg);
    const segundos = Math.ceil(BLOQUEIO_MS / 1000);
    res.set("Retry-After", String(segundos));
    return res.status(429).json({
      erro: `Muitas tentativas de login. Tente novamente em ${segundos} segundos.`,
    });
  }

  reg.tentativas.push(agora);
  tentativasPorIp.set(ip, reg);

  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      tentativasPorIp.delete(ip);
    }
  });

  next();
}
