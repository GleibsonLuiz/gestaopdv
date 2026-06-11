import { useEffect, useState } from "react";
import { api, ApiError } from "./api";

// ============ FILA OFFLINE DE VENDAS (PDV offline-first) ============
//
// Quando a conexao cai no meio do expediente, a venda NAO pode parar: o
// payload completo (que ja carrega idempotencyKey) e guardado em IndexedDB
// e enviado automaticamente quando a rede volta. A idempotencia do backend
// garante que retries nunca duplicam — inclusive no caso traicoeiro de
// TIMEOUT em que o servidor gravou mas a resposta se perdeu: o reenvio com
// a mesma chave devolve a venda ja criada.
//
// Politica de erros no sync:
//   - NETWORK/TIMEOUT  -> ainda offline; para o lote e tenta depois.
//   - 4xx/5xx          -> problema REAL (estoque, caixa fechado, validacao);
//                         marca o erro na pendencia e segue para a proxima.
//                         O operador ve o motivo no painel e decide
//                         (reabrir caixa e reenviar, ou descartar).

export interface ResumoVendaPendente {
  total: number;
  itens: number;
  formas: string[];
}

export interface VendaPendente {
  chave: string; // idempotencyKey — tambem e a chave primaria da fila
  payload: Record<string, unknown>;
  criadoEm: number;
  tentativas: number;
  ultimoErro: string | null;
  resumo: ResumoVendaPendente;
}

const DB_NOME = "gestao_pdv_offline";
const STORE = "vendas_pendentes";
const EVENTO_MUDOU = "vendas-offline:mudou";

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "chave" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(modo: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrirDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, modo);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
        t.onabort = () => db.close();
      }),
  );
}

function notificarMudanca() {
  window.dispatchEvent(new CustomEvent(EVENTO_MUDOU));
}

export async function enfileirarVenda(
  payload: Record<string, unknown>,
  resumo: ResumoVendaPendente,
): Promise<void> {
  const pendente: VendaPendente = {
    chave: String(payload.idempotencyKey),
    payload,
    criadoEm: Date.now(),
    tentativas: 0,
    ultimoErro: null,
    resumo,
  };
  await tx("readwrite", (s) => s.put(pendente));
  notificarMudanca();
}

export async function listarPendentes(): Promise<VendaPendente[]> {
  const todas = await tx<VendaPendente[]>("readonly", (s) => s.getAll());
  return todas.sort((a, b) => a.criadoEm - b.criadoEm);
}

export async function contarPendentes(): Promise<number> {
  return tx<number>("readonly", (s) => s.count());
}

export async function removerPendente(chave: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(chave));
  notificarMudanca();
}

// Descarte manual (decisao do operador para pendencia com erro permanente).
export const descartarPendente = removerPendente;

async function marcarErro(p: VendaPendente, mensagem: string): Promise<void> {
  await tx("readwrite", (s) =>
    s.put({ ...p, tentativas: p.tentativas + 1, ultimoErro: mensagem }),
  );
  notificarMudanca();
}

// ===== SINCRONIZACAO =====

export interface ResultadoSync {
  enviadas: number;
  comErro: number;
  pendentes: number;
}

let sincronizando = false;

export async function sincronizarVendasPendentes(): Promise<ResultadoSync> {
  if (sincronizando) return { enviadas: 0, comErro: 0, pendentes: await contarPendentes() };
  sincronizando = true;
  try {
    const lista = await listarPendentes();
    let enviadas = 0;
    let comErro = 0;
    for (const venda of lista) {
      try {
        await api.criarVenda(venda.payload);
        await removerPendente(venda.chave);
        enviadas++;
      } catch (err) {
        if (err instanceof ApiError && (err.kind === "NETWORK" || err.kind === "TIMEOUT")) {
          break; // segue offline — para o lote, o proximo gatilho tenta de novo
        }
        await marcarErro(venda, (err as Error)?.message || "Falha desconhecida");
        comErro++;
      }
    }
    return { enviadas, comErro, pendentes: await contarPendentes() };
  } finally {
    sincronizando = false;
  }
}

// Reage a mudancas na fila (badge, paineis). Retorna o unsubscribe.
export function aoMudarFila(cb: () => void): () => void {
  window.addEventListener(EVENTO_MUDOU, cb);
  return () => window.removeEventListener(EVENTO_MUDOU, cb);
}

// Contador vivo de pendencias para a UI.
export function useVendasPendentes(): number {
  const [quantidade, setQuantidade] = useState(0);
  useEffect(() => {
    let ativo = true;
    const atualizar = () => {
      contarPendentes().then((n) => { if (ativo) setQuantidade(n); }).catch(() => {});
    };
    atualizar();
    const off = aoMudarFila(atualizar);
    return () => { ativo = false; off(); };
  }, []);
  return quantidade;
}
