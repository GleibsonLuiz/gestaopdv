// Helper para gerar numero sequencial por tenant.
//
// Antes da ETAPA 8 do multi-tenant, Venda/Compra/Caixa/Orcamento/Oportunidade
// usavam @default(autoincrement()) com unique global. Isso significava que
// dois tenants compartilhavam a mesma sequencia (UX feia: tenant B comecando
// numa Venda #341 porque tenant A ja tinha 340).
//
// Agora cada tenant tem sua propria sequencia comecando em 1. Implementacao:
//   1. Query MAX(numero) WHERE tenantId = X — retorna o maior numero usado
//      pelo tenant, ou 0 se for o primeiro.
//   2. Retorna MAX + 1.
//
// Race condition: dois creates simultaneos no mesmo tenant podem ler o mesmo
// MAX e tentar usar o mesmo numero. O @@unique([tenantId, numero]) no
// schema garante integridade — o segundo create falha com P2002. O caller
// deve detectar e re-tentar (proximoNumeroComRetry resolve isso).

/**
 * Calcula o proximo numero sequencial para uma entidade tenant-scoped.
 *
 * @param {object} delegate - Prisma delegate (ex: tx.venda, prisma.compra)
 * @param {string} tenantId - id da Empresa
 * @returns {Promise<number>} proximo numero (>=1)
 */
export async function proximoNumero(delegate, tenantId) {
  const agg = await delegate.aggregate({
    where: { tenantId },
    _max: { numero: true },
  });
  return (agg._max?.numero || 0) + 1;
}

/**
 * Executa uma operacao de create com retry automatico em caso de race
 * condition. Re-calcula MAX+1 em cada tentativa.
 *
 * @param {object} delegate
 * @param {string} tenantId
 * @param {(numero: number) => Promise<any>} criar - callback que recebe
 *        o numero calculado e retorna a promise do create
 * @param {number} maxTentativas - default 5
 * @returns resultado do criar()
 */
export async function criarComNumeroRetry(delegate, tenantId, criar, maxTentativas = 5) {
  let ultimoErro = null;
  for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
    const numero = await proximoNumero(delegate, tenantId);
    try {
      return await criar(numero);
    } catch (err) {
      // P2002 = unique constraint violation. Pode ser race entre 2 creates
      // simultaneos no mesmo tenant. Retry incrementando.
      if (err.code === "P2002" && err.meta?.target?.includes("numero")) {
        ultimoErro = err;
        continue;
      }
      throw err;
    }
  }
  throw ultimoErro || new Error("Falha ao gerar numero sequencial apos retries");
}
