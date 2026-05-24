// =====================================================================
// ETAPA#8a — Web Bluetooth: pareamento + envio para impressoras
// termicas portateis/balcao. Suporta apenas Chromium-based em HTTPS
// ou localhost (Firefox/Safari ainda nao implementam Web Bluetooth).
//
// Como cada fabricante usa um UUID de service/characteristic diferente,
// fazemos requestDevice com acceptAllDevices + lista de optionalServices
// dos mais comuns no Brasil (Bematech, Tanca, Elgin, MTP).
//
// Limite de payload: maioria das impressoras BLE aceita 100-512 bytes
// por write. Quebramos o stream em chunks de 100 para garantir.
// =====================================================================

// UUIDs de servicos/characteristics mais comuns em impressoras termicas BLE.
// (Os fabricantes raramente publicam — esses sao os observados em
// pesquisa de campo: ESC/POS generico + GATT padrao 0xFFE0/0xFFE1.)
const SERVICES_CONHECIDOS = [
  0x18F0,  // Serial Port Profile generico
  0xFFE0,  // HM-10 / muitas BT3 emuladas
  0xFF00,
  // UUIDs full text de alguns modelos
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Microchip RN4870
];

const CHARS_ESCRITA = [
  0x2AF1, // ESC/POS write generico
  0xFFE1, // HM-10
  "00002af1-0000-1000-8000-00805f9b34fb",
  "0000ffe1-0000-1000-8000-00805f9b34fb",
  "49535343-8841-43f4-a8d4-ecbe34729bb3",
];

const CHUNK = 100;
const KEY_DEVICE_ID = "gestaopro_print_bt_id";

interface BluetoothCharacteristic {
  writeValueWithoutResponse(data: ArrayBufferView): Promise<void>;
  writeValue(data: ArrayBufferView): Promise<void>;
  properties?: { writeWithoutResponse?: boolean };
}

interface NavigatorBluetooth {
  bluetooth?: {
    requestDevice(opts: unknown): Promise<unknown>;
    getDevices?(): Promise<unknown[]>;
  };
}

export function bluetoothDisponivel(): boolean {
  return typeof navigator !== "undefined"
    && !!(navigator as unknown as NavigatorBluetooth).bluetooth;
}

/**
 * Pareia (ou re-conecta) a uma impressora ESC/POS via BLE e envia o
 * stream binario gerado por escposPedido.gerarComandosPedido().
 *
 * Lanca Error com mensagens amigaveis quando o navegador nao suporta,
 * o usuario cancela o dialogo de pareamento, ou nao foi possivel
 * encontrar service/characteristic compativel.
 */
export async function imprimirViaBluetooth(comandos: Uint8Array): Promise<void> {
  if (!bluetoothDisponivel()) {
    throw new Error("Este navegador nao suporta Web Bluetooth. Use Chrome/Edge em HTTPS ou localhost.");
  }
  const bt = (navigator as unknown as NavigatorBluetooth).bluetooth!;

  // 1. Solicita dispositivo (pode reutilizar pareamento anterior em
  // browsers que suportam getDevices()).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const device: any = await bt.requestDevice({
    acceptAllDevices: true,
    optionalServices: SERVICES_CONHECIDOS,
  }).catch((err: Error) => {
    throw new Error("Pareamento cancelado: " + err.message);
  });
  try { localStorage.setItem(KEY_DEVICE_ID, device.id || ""); } catch {}

  // 2. Conecta GATT.
  const server = await device.gatt.connect();

  // 3. Procura primeiro service+characteristic com permissao de escrita.
  let characteristic: BluetoothCharacteristic | null = null;
  for (const svcUuid of SERVICES_CONHECIDOS) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svc: any = await server.getPrimaryService(svcUuid);
      for (const chrUuid of CHARS_ESCRITA) {
        try {
          const chr = await svc.getCharacteristic(chrUuid);
          if (chr) { characteristic = chr; break; }
        } catch { /* tenta proximo */ }
      }
      if (characteristic) break;
    } catch { /* tenta proximo service */ }
  }
  if (!characteristic) {
    server.disconnect();
    throw new Error("Impressora pareada nao expoe characteristic de escrita compativel.");
  }

  // 4. Envia em chunks de 100 bytes (limite seguro para BLE).
  const writer = characteristic.properties?.writeWithoutResponse
    ? characteristic.writeValueWithoutResponse.bind(characteristic)
    : characteristic.writeValue.bind(characteristic);
  for (let off = 0; off < comandos.length; off += CHUNK) {
    const slice = comandos.subarray(off, Math.min(off + CHUNK, comandos.length));
    await writer(slice);
    // Pequena pausa para nao saturar o buffer da impressora.
    if (off + CHUNK < comandos.length) await new Promise(r => setTimeout(r, 15));
  }

  // 5. Desconecta (mantemos pareamento — proxima impressao reusa).
  setTimeout(() => { try { server.disconnect(); } catch {} }, 500);
}
