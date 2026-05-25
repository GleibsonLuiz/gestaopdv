// =====================================================================
// Hub SSE (Server-Sent Events) — broadcast por tenant.
//
// Cada conexao registra um Response no Set do seu tenantId. Quando um
// endpoint quer notificar mudanca, chama broadcast(tenantId, tipo, dados)
// e o hub serializa o evento e escreve em todos os clientes do tenant.
//
// Heartbeat de 30s: alguns proxies (nginx default 60s) matam conexoes
// "inativas". O comentario ":hb\n\n" mantem a conexao viva sem disparar
// nada no listener do client.
// =====================================================================

const HEARTBEAT_MS = 30_000;

// Map<tenantId, Set<Response>>
const salas = new Map();

function montar(tipo, dados) {
  const json = JSON.stringify(dados);
  return `event: ${tipo}\ndata: ${json}\n\n`;
}

export function registrar(tenantId, res) {
  if (!salas.has(tenantId)) salas.set(tenantId, new Set());
  const sala = salas.get(tenantId);
  sala.add(res);

  // Envia "hello" assim que conecta — front confirma que SSE esta vivo.
  try { res.write(montar("hello", { ts: Date.now(), conectados: sala.size })); } catch {}

  // Heartbeat por conexao — comentarios SSE (linhas iniciando com ":")
  // nao chamam o listener, so reabilitam timers de keep-alive.
  const hb = setInterval(() => {
    try { res.write(":hb\n\n"); } catch {}
  }, HEARTBEAT_MS);

  // Cleanup quando o cliente desconecta.
  const fechar = () => {
    clearInterval(hb);
    sala.delete(res);
    if (sala.size === 0) salas.delete(tenantId);
  };
  res.on("close", fechar);
  res.on("error", fechar);
}

export function broadcast(tenantId, tipo, dados) {
  const sala = salas.get(tenantId);
  if (!sala || sala.size === 0) return;
  const payload = montar(tipo, dados);
  for (const res of sala) {
    try { res.write(payload); } catch {
      // se falhou a escrita, o close listener vai limpar — ignora.
    }
  }
}

export function totalConexoes(tenantId) {
  return salas.get(tenantId)?.size || 0;
}
