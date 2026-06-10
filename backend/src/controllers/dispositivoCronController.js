import { compararSegredo } from "../lib/timingSafe.js";
import { expirarDispositivosOciosos } from "../lib/dispositivos.js";

// ============ CRON: EXPIRAR DISPOSITIVOS OCIOSOS ============
//
// Higiene diaria da licenca por maquina: revoga dispositivos ATIVOS sem acesso
// ha mais de N dias (DISPOSITIVO_DIAS_INATIVIDADE, default 60), liberando a vaga
// automaticamente quando o cliente trocou de computador e nunca derrubou o
// antigo. Cross-tenant. Auth por Bearer ${CRON_SECRET} (mesmo padrao dos demais
// crons). Idempotente: rodar de novo nao muda nada se nada estiver ocioso.
export async function cronExpirarDispositivos(req, res, next) {
  try {
    const chave = process.env.CRON_SECRET;
    if (!chave) return res.status(503).json({ erro: "CRON_SECRET nao configurado no servidor" });
    const header = req.headers.authorization || "";
    const recebido = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!compararSegredo(recebido, chave)) {
      return res.status(401).json({ erro: "Chave de cron invalida" });
    }

    const dias = Number(process.env.DISPOSITIVO_DIAS_INATIVIDADE) || 60;
    const { revogados } = await expirarDispositivosOciosos(dias);
    res.json({ ok: true, dias, revogados });
  } catch (err) {
    next(err);
  }
}
