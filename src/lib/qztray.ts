// =====================================================================
// Transporte QZ Tray — imprime ESC/POS direto numa impressora ESCOLHIDA
// pelo nome, via o agente QZ Tray rodando no PC (wss://localhost:8181).
//
// Por que existe: window.print() do navegador SÓ imprime na impressora
// PADRÃO do Windows. Quando o mesmo PC usa outras impressoras (gráfica),
// o lojista teria que ficar trocando a padrão. O QZ Tray resolve: o
// sistema manda o cupom direto pra "POS80 Printer" pelo nome, silencioso,
// e a padrão do Windows fica livre.
//
// Reaproveita os comandos de escpos.ts / gerarComandosPedido() — o QZ é
// só mais um "transporte" dos mesmos bytes (junto com Web Bluetooth).
//
// Config é POR MÁQUINA (localStorage), não por tenant: o nome da
// impressora é específico de cada PC físico.
//
// Modo atual: comunidade (sem certificado). O QZ mostra um aviso de
// confiança na 1ª impressão; o usuário marca "Lembrar" e fica silencioso.
// Para o produto (venda a lojistas), dá pra plugar certificado próprio
// depois via qz.security.setCertificatePromise/setSignaturePromise.
// =====================================================================
import * as e from "./escpos";
import { api } from "./api";

const LS_ATIVO = "gestaopro_qz_ativo";
const LS_IMPRESSORA = "gestaopro_qz_impressora";

// Certificado PÚBLICO do GestãoProMax. Pode ficar no bundle — é público por
// natureza. O par (chave privada) vive SÓ no backend (env QZ_PRIVATE_KEY_B64)
// e assina cada pedido via POST /impressao-qz/sign. Com isso o QZ reconhece o
// site como confiável: o aviso passa a permitir "Lembrar + Allow" (some de vez
// após aprovar 1x por PC). Sem a env no backend, a assinatura falha e o QZ
// cai no modo comunidade (aviso por sessão) — degradação graciosa.
const QZ_CERT = `-----BEGIN CERTIFICATE-----
MIIDVzCCAj+gAwIBAgIUX/4mzgL+RqqGAggI5peUNy71kNswDQYJKoZIhvcNAQEL
BQAwOzEVMBMGA1UEAwwMR2VzdGFvUHJvTWF4MRUwEwYDVQQKDAxHZXN0YW9Qcm9N
YXgxCzAJBgNVBAYTAkJSMB4XDTI2MDYwOTIwMDkyNloXDTM2MDYwNjIwMDkyNlow
OzEVMBMGA1UEAwwMR2VzdGFvUHJvTWF4MRUwEwYDVQQKDAxHZXN0YW9Qcm9NYXgx
CzAJBgNVBAYTAkJSMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvOL8
thg7z9Tq2+P/Pq5umkHuExOiF3TZDD/FZeI8nKd5LjvvjUHwblPYv7wSwSTKIKH9
QuiHEeKjo/6zcmDsHsP6Lh5lD9nnHAc32QLKGUmZU8NRPivzzeepdtv4em/sVgle
cG51ZHU8ginit3nnXtO2zpc6f4AjL8GicFsFQOyFf7k2u0NobuugQIb/wPmohgnI
tilTb7ssOvJb3+oiHBgvBXWkQlcmYl1irRbgefCbluvK/maiul7Us/pWE7D7SxuW
u3oEdr3Bl15SPQHj491tbDCgSLWcUUjvkuXCIfYlEFPnwAvjoFflUrdxkrG3SmMX
P0d2I+ew873nicS+pQIDAQABo1MwUTAdBgNVHQ4EFgQUnvHplSa7ka6HiC1l91H+
DXKkHaowHwYDVR0jBBgwFoAUnvHplSa7ka6HiC1l91H+DXKkHaowDwYDVR0TAQH/
BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAWB8X5hHYLHdO115jMLtkkKPc78zb
V40LNq+R3yAy/obRDuIbGEpL4KxORhxEnZzYrzti830t62tI7bi+Gc1EBEnTvkXE
LzZ6mvyYs5jpWF//PL8RI9pA/F8bMaOddEdLPgUqGwrbdWLKAeogGDRq7K3dDl2Y
mdjvOBrJLhuGUT3tbKTGmaAul+EKs/Hxe0akvyqjadoBoNxecTg3RXjEesgygcUt
JCXjEo1AYx9u5E3NIUCchae0gAF33t+5Ei6U75Sroax2sWqwxCgvzrifTXOsxC0Q
jnQkCe07ovQWotgRZ2Z2UTii/n7b3c8Zhv/AuooidTN70qAV7J8g3MbyTQ==
-----END CERTIFICATE-----`;

// Configura a segurança do QZ uma única vez por sessão: apresenta o
// certificado público e delega a assinatura ao backend (chave privada lá).
let segurancaConfigurada = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function configurarSeguranca(qz: any): void {
  if (segurancaConfigurada) return;
  segurancaConfigurada = true;
  qz.security.setCertificatePromise((resolve: (c: string) => void) => resolve(QZ_CERT));
  qz.security.setSignatureAlgorithm("SHA512");
  qz.security.setSignaturePromise((toSign: string) =>
    (resolve: (s: string) => void, reject: (err: unknown) => void) => {
      api.assinarQz(toSign)
        .then((sig: string) => resolve(sig))
        .catch((err: unknown) => reject(err));
    },
  );
}

// Carrega a lib oficial sob demanda (lazy) — fica fora do bundle principal
// e só é baixada quando alguém realmente usa o QZ.
let qzPromise: Promise<unknown> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function carregarQz(): Promise<any> {
  if (!qzPromise) {
    qzPromise = import("qz-tray").then(m => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = m as any;
      return mod.default || mod;
    });
  }
  return qzPromise;
}

export type QzConfig = { ativo: boolean; impressora: string };

export function qzConfig(): QzConfig {
  try {
    return {
      ativo: localStorage.getItem(LS_ATIVO) === "1",
      impressora: localStorage.getItem(LS_IMPRESSORA) || "",
    };
  } catch {
    return { ativo: false, impressora: "" };
  }
}

export function salvarQzConfig(cfg: Partial<QzConfig>): void {
  try {
    if (cfg.ativo !== undefined) localStorage.setItem(LS_ATIVO, cfg.ativo ? "1" : "0");
    if (cfg.impressora !== undefined) localStorage.setItem(LS_IMPRESSORA, cfg.impressora);
  } catch { /* localStorage indisponivel — ignora */ }
}

/** Decide se o fluxo de venda deve usar o QZ (ligado + impressora escolhida). */
export function qzAtivoEConfigurado(): boolean {
  const c = qzConfig();
  return c.ativo && !!c.impressora;
}

/** Conecta no agente (idempotente). Lança erro se o QZ Tray não estiver rodando. */
export async function conectarQz(): Promise<void> {
  const qz = await carregarQz();
  if (qz.websocket.isActive()) return;
  // Apresenta o certificado + delega assinatura ao backend ANTES de conectar.
  configurarSeguranca(qz);
  await qz.websocket.connect({ retries: 1, delay: 1 });
}

/** True se o agente QZ Tray está acessível neste PC. */
export async function qzDetectado(): Promise<boolean> {
  try {
    await conectarQz();
    return true;
  } catch {
    return false;
  }
}

/** Lista as impressoras instaladas no PC (pelo nome do Windows). */
export async function listarImpressorasQz(): Promise<string[]> {
  const qz = await carregarQz();
  await conectarQz();
  const found = await qz.printers.find();
  if (Array.isArray(found)) return found as string[];
  return found ? [found as string] : [];
}

// Uint8Array -> base64 (em chunks p/ não estourar o stack em cupons grandes).
function bytesParaBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    bin += String.fromCharCode(...slice);
  }
  return btoa(bin);
}

/** Envia bytes ESC/POS brutos pra impressora escolhida (ou a passada). */
export async function imprimirRawQz(bytes: Uint8Array, impressora?: string): Promise<void> {
  const qz = await carregarQz();
  await conectarQz();
  const nome = impressora || qzConfig().impressora;
  if (!nome) throw new Error("Nenhuma impressora selecionada no agente QZ Tray.");
  const cfg = qz.configs.create(nome);
  const b64 = bytesParaBase64(bytes);
  await qz.print(cfg, [{ type: "raw", format: "command", flavor: "base64", data: b64 }]);
}

/** Cupom de teste em ESC/POS (usado no botão "Imprimir teste via agente"). */
export function comandosTesteQz(nomeEmpresa = "ESTABELECIMENTO"): Uint8Array {
  return e.concat([
    e.init(),
    e.align(1), e.bold(true), e.fontSize(1, 2),
    e.linha((nomeEmpresa || "ESTABELECIMENTO").toUpperCase()),
    e.fontSize(1, 1),
    e.linha("TESTE VIA AGENTE QZ TRAY"),
    e.bold(false), e.align(0),
    e.divisor(48, "="),
    e.linha("Se este cupom saiu, a impressao"),
    e.linha("direta pelo sistema esta OK."),
    e.divisor(48),
    e.linhaDireita("Produto exemplo", "R$ 9,90", 48),
    e.linhaDireita("Outro item", "R$ 1,10", 48),
    e.divisor(48),
    e.bold(true), e.fontSize(1, 2),
    e.linhaDireita("TOTAL:", "R$ 11,00", 24),
    e.bold(false), e.fontSize(1, 1),
    e.newLine(1), e.align(1),
    e.linha(new Date().toLocaleString("pt-BR")),
    e.align(0), e.newLine(3),
    e.cut(),
  ]);
}
