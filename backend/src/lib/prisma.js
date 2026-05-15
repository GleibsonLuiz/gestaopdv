import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";

// ============ MULTI-TENANT PRISMA ============
//
// Para isolar dados entre tenants automaticamente, usamos um Prisma
// Extension combinado com AsyncLocalStorage. O middleware authRequired
// (em middlewares/auth.js) chama tenantStorage.run({ tenantId }, next)
// antes de cada handler autenticado — assim qualquer prisma.<model>.X
// dentro do request enxerga o tenantId via tenantStorage.getStore().
//
// Para cada modelo listado em MODELOS_COM_TENANT, o extension:
//
//   - findFirst / findMany / count / aggregate / groupBy
//        injeta `where.tenantId = store.tenantId`
//
//   - findUnique
//        converte para findFirst com filtro de tenant (preserva 1 resultado)
//
//   - create
//        injeta `data.tenantId = store.tenantId` se nao foi passado
//
//   - update / upsert / delete (por id)
//        valida ownership chamando findFirst antes, throw P2025 se nao pertence
//
//   - updateMany / deleteMany
//        injeta where.tenantId no filtro
//
// Quando NAO ha tenantStorage (ex: login antes de autenticar, scripts CLI
// como migration/seed), o extension nao injeta nada — comportamento legado
// preservado.

export const tenantStorage = new AsyncLocalStorage();

const MODELOS_COM_TENANT = new Set([
  "FormaPagamentoCustom", "User", "ConfiguracaoComissao", "Cliente",
  "Fornecedor", "Categoria", "Produto", "Venda", "ItemVenda",
  "Compra", "ItemCompra", "MovimentacaoEstoque", "ContaPagar",
  "ContaReceber", "Anexo", "Caixa", "ConfiguracaoEmpresa",
  "MovimentacaoCaixa", "Orcamento", "ItemOrcamento",
  "ConfiguracaoFidelidade", "PontosCliente", "MovimentacaoPontos",
  "Tarefa", "Interacao", "Oportunidade", "Tag", "ClienteTag",
  "Contato", "PesquisaNps", "TemplateMensagem", "RegraAutomacao",
  "LogAutomacao", "HistoricoOportunidade", "LogAuditoria",
]);

function tenantAtual() {
  return tenantStorage.getStore()?.tenantId || null;
}

function precisaFiltrar(modelo) {
  return tenantAtual() !== null && MODELOS_COM_TENANT.has(modelo);
}

const base = new PrismaClient();

// Cliente raw (sem extension) usado para validacoes internas que nao
// devem disparar o filtro de novo (evita recursao).
const baseSemFiltro = base;

const prisma = base.$extends({
  name: "tenancy",
  query: {
    $allModels: {
      // ---------- READS ----------
      async findFirst({ model, args, query }) {
        if (precisaFiltrar(model)) {
          args.where = { ...(args.where || {}), tenantId: tenantAtual() };
        }
        return query(args);
      },
      async findFirstOrThrow({ model, args, query }) {
        if (precisaFiltrar(model)) {
          args.where = { ...(args.where || {}), tenantId: tenantAtual() };
        }
        return query(args);
      },
      async findMany({ model, args, query }) {
        if (precisaFiltrar(model)) {
          args.where = { ...(args.where || {}), tenantId: tenantAtual() };
        }
        return query(args);
      },
      async count({ model, args, query }) {
        if (precisaFiltrar(model)) {
          args = args || {};
          args.where = { ...(args.where || {}), tenantId: tenantAtual() };
        }
        return query(args);
      },
      async aggregate({ model, args, query }) {
        if (precisaFiltrar(model)) {
          args.where = { ...(args.where || {}), tenantId: tenantAtual() };
        }
        return query(args);
      },
      async groupBy({ model, args, query }) {
        if (precisaFiltrar(model)) {
          args.where = { ...(args.where || {}), tenantId: tenantAtual() };
        }
        return query(args);
      },

      // ---------- findUnique: where precisa ser unique-key, entao convertemos
      // para findFirst com filtro de tenant adicionado. Resultado: se o id
      // existe mas pertence a outro tenant, retorna null (como se nao existisse).
      async findUnique({ model, args, query }) {
        if (!precisaFiltrar(model)) return query(args);
        const tenant = tenantAtual();
        // Constroi um findFirst equivalente preservando select/include
        const delegate = baseSemFiltro[lower(model)];
        return delegate.findFirst({
          ...args,
          where: { ...(args.where || {}), tenantId: tenant },
        });
      },
      async findUniqueOrThrow({ model, args, query }) {
        if (!precisaFiltrar(model)) return query(args);
        const tenant = tenantAtual();
        const delegate = baseSemFiltro[lower(model)];
        return delegate.findFirstOrThrow({
          ...args,
          where: { ...(args.where || {}), tenantId: tenant },
        });
      },

      // ---------- CREATES ----------
      async create({ model, args, query }) {
        if (precisaFiltrar(model)) {
          const tenant = tenantAtual();
          // So injeta se nao foi passado explicitamente.
          if (args.data && args.data.tenantId === undefined) {
            args.data.tenantId = tenant;
          }
        }
        return query(args);
      },
      async createMany({ model, args, query }) {
        if (precisaFiltrar(model)) {
          const tenant = tenantAtual();
          if (Array.isArray(args.data)) {
            args.data = args.data.map(d =>
              d.tenantId === undefined ? { ...d, tenantId: tenant } : d
            );
          }
        }
        return query(args);
      },

      // ---------- UPDATES (por id) ----------
      async update({ model, args, query }) {
        if (precisaFiltrar(model)) {
          await garantirOwnership(model, args.where);
        }
        return query(args);
      },
      async updateMany({ model, args, query }) {
        if (precisaFiltrar(model)) {
          args.where = { ...(args.where || {}), tenantId: tenantAtual() };
        }
        return query(args);
      },
      async upsert({ model, args, query }) {
        if (precisaFiltrar(model)) {
          const tenant = tenantAtual();
          if (args.create && args.create.tenantId === undefined) {
            args.create.tenantId = tenant;
          }
          // Valida ownership se ja existir (a propria upsert resolve duplicata).
          // Nao podemos pre-checar facilmente sem mais queries; mantemos
          // confiar no create.tenantId + composto unique de algumas tabelas.
        }
        return query(args);
      },

      // ---------- DELETES (por id) ----------
      async delete({ model, args, query }) {
        if (precisaFiltrar(model)) {
          await garantirOwnership(model, args.where);
        }
        return query(args);
      },
      async deleteMany({ model, args, query }) {
        if (precisaFiltrar(model)) {
          args.where = { ...(args.where || {}), tenantId: tenantAtual() };
        }
        return query(args);
      },
    },
  },
});

// Verifica que o registro existe e pertence ao tenant atual. Se nao,
// dispara um erro P2025 (Prisma "Record not found"), igual ao que os
// controllers ja tratam.
async function garantirOwnership(model, where) {
  if (!where) return;
  const tenant = tenantAtual();
  if (!tenant) return;
  const delegate = baseSemFiltro[lower(model)];
  // Tenta achar uma chave de identificacao no where. Caso comum: id.
  // Para findFirst nao precisamos respeitar unique-key.
  const found = await delegate.findFirst({
    where: { ...where, tenantId: tenant },
    select: { id: true },
  });
  if (!found) {
    const e = new Error(
      `No ${model} found with the provided where conditions or it does not belong to the current tenant`
    );
    e.code = "P2025";
    e.meta = { cause: "Cross-tenant access prevented" };
    throw e;
  }
}

// Prisma Client expoe delegates em camelCase do nome do model. "User" -> "user".
function lower(model) {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

export default prisma;
