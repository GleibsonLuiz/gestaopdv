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
  "Fornecedor", "Categoria", "Fabricante", "Produto", "Venda", "ItemVenda", "VendaPagamento",
  "Compra", "ItemCompra", "MovimentacaoEstoque", "ContaPagar",
  "ContaReceber", "Anexo", "Caixa", "ConfiguracaoEmpresa",
  "ConfiguracaoImpressora",
  "MovimentacaoCaixa", "Orcamento", "ItemOrcamento",
  "ConfiguracaoFidelidade", "PontosCliente", "MovimentacaoPontos",
  "Tarefa", "Interacao", "Oportunidade", "Tag", "ClienteTag",
  "Contato", "PesquisaNps", "TemplateMensagem", "RegraAutomacao",
  "LogAutomacao", "HistoricoOportunidade", "LogAuditoria",
  "Inventario", "InventarioItem", "IntencaoPagamentoMP",
  "Comanda", "ItemComanda",
  "WhatsappSettings", "WhatsappLog",
  "VendaEspera",
]);

function tenantAtual() {
  return tenantStorage.getStore()?.tenantId || null;
}

function precisaFiltrar(modelo) {
  return tenantAtual() !== null && MODELOS_COM_TENANT.has(modelo);
}

const base = new PrismaClient();

// Cliente raw (sem extension) usado para validacoes internas que nao
// devem disparar o filtro de novo (evita recursao). TAMBEM exportado
// para uso pelo adminMasterController, que precisa operar cross-tenant
// (criar/atualizar/deletar em empresas que nao sao o tenant logado).
const baseSemFiltro = base;
export const prismaRaw = base;

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

      // ---------- findUnique: where precisa ser unique-key (id, etc), entao
      // nao da pra adicionar filtro de tenantId no where. Em vez disso,
      // executamos a query normalmente (via query() — preservando contexto
      // de transacao) e validamos o tenantId NO RESULTADO. Se pertencer a
      // outro tenant, retornamos null como se nao existisse.
      //
      // IMPORTANTE: usar query() ao inves de delegate base e essencial para
      // queries dentro de prisma.$transaction — o tx tem visibilidade de
      // creates recem-feitos na mesma tx, o cliente base nao.
      async findUnique({ model, args, query }) {
        const result = await query(args);
        if (!precisaFiltrar(model) || !result) return result;
        const tenant = tenantAtual();
        // Se select removeu tenantId, nao da pra validar — confia no caller.
        // Caso comum (sem select especifico) traz tenantId automaticamente.
        if (result.tenantId !== undefined && result.tenantId !== tenant) {
          return null;
        }
        return result;
      },
      async findUniqueOrThrow({ model, args, query }) {
        const result = await query(args);
        if (!precisaFiltrar(model)) return result;
        const tenant = tenantAtual();
        if (result.tenantId !== undefined && result.tenantId !== tenant) {
          // Simula o not-found do findUniqueOrThrow original
          const err = new Error(`No ${model} found`);
          err.code = "P2025";
          throw err;
        }
        return result;
      },

      // ---------- CREATES ----------
      async create({ model, args, query }) {
        if (precisaFiltrar(model)) {
          const tenant = tenantAtual();
          // Auto-fill no nivel raiz...
          if (args.data && args.data.tenantId === undefined) {
            args.data.tenantId = tenant;
          }
          // ... e em nested writes (data: { itens: { create: [...] } })
          if (args.data) propagarTenantEmCreate(args.data, tenant);
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

// Propaga tenantId recursivamente em nested writes do `create`.
//
// Caso classico: prisma.venda.create({ data: { ..., itens: { create: [...] } } })
// O hook `create` do extension so injeta tenantId no nivel raiz; sem este
// helper, os itens_venda ficavam orfaos (tenantId NULL).
//
// Premissa: todo model no schema (exceto Empresa) tem tenantId. Empresa nunca
// e nested write (e o tenant root). Logo, qualquer nested .create / .createMany.data /
// .connectOrCreate.create pode receber tenantId com seguranca.
//
// Nao toca em `connect: { id }` (apenas referencia), `disconnect`, `update`,
// `set` etc — soh nas operacoes que CRIAM novos registros.
function propagarTenantEmCreate(data, tenant) {
  if (!data || typeof data !== "object") return;
  for (const key of Object.keys(data)) {
    const valor = data[key];
    if (!valor || typeof valor !== "object") continue;

    // Nested: { create: <obj> } ou { create: [<obj>, ...] }
    if (valor.create !== undefined) {
      if (Array.isArray(valor.create)) {
        for (const item of valor.create) {
          if (item && typeof item === "object" && item.tenantId === undefined) {
            item.tenantId = tenant;
          }
          propagarTenantEmCreate(item, tenant);
        }
      } else if (typeof valor.create === "object") {
        if (valor.create.tenantId === undefined) {
          valor.create.tenantId = tenant;
        }
        propagarTenantEmCreate(valor.create, tenant);
      }
    }

    // Nested: { createMany: { data: [<obj>, ...] } }
    if (valor.createMany?.data && Array.isArray(valor.createMany.data)) {
      for (const item of valor.createMany.data) {
        if (item && typeof item === "object" && item.tenantId === undefined) {
          item.tenantId = tenant;
        }
      }
    }

    // Nested: { connectOrCreate: { where, create: <obj> } }
    if (valor.connectOrCreate?.create && typeof valor.connectOrCreate.create === "object") {
      if (valor.connectOrCreate.create.tenantId === undefined) {
        valor.connectOrCreate.create.tenantId = tenant;
      }
      propagarTenantEmCreate(valor.connectOrCreate.create, tenant);
    }
  }
}

export default prisma;
