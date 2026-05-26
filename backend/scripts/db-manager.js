// =============================================================================
// db-manager.js — CLI de backup/restore do banco PostgreSQL (GestaoPRO)
// =============================================================================
//
// Uso:
//   node backend/scripts/db-manager.js backup
//   node backend/scripts/db-manager.js restore <arquivo.sql> [--force]
//   node backend/scripts/db-manager.js list
//   node backend/scripts/db-manager.js verify <arquivo.sql>
//
// Pre-requisitos:
//   - pg_dump e psql no PATH (PostgreSQL Client Tools). No Windows:
//       https://www.postgresql.org/download/windows/
//       (na instalacao, selecione apenas "Command Line Tools")
//   - DATABASE_URL definido em backend/.env
//
// Coexiste com backupController.js (que faz backup JSON via HTTP).
// Este script gera dumps SQL nativos, ideais para DR/cron/admin offline.
// =============================================================================

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_DIR = path.resolve(__dirname, "..");
const BACKUPS_DIR = path.join(BACKEND_DIR, "backups");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");
const LOG_FILE = path.join(LOGS_DIR, "db-manager.log");

loadDotenv({ path: path.join(BACKEND_DIR, ".env") });

const SQL_HEADER = "-- PostgreSQL database dump";
const SQL_FOOTER = "PostgreSQL database dump complete";

// =============================================================================
// Logging
// =============================================================================
//
// Escreve em console (com cores ANSI) e tambem persiste em logs/db-manager.log
// para auditoria. Niveis: info | warn | erro | sucesso.

const COR = {
  reset: "\x1b[0m",
  cinza: "\x1b[90m",
  verde: "\x1b[32m",
  amarelo: "\x1b[33m",
  vermelho: "\x1b[31m",
  ciano: "\x1b[36m",
};

async function log(nivel, mensagem) {
  const agora = new Date().toISOString();
  const linha = `[${agora}] [${nivel.toUpperCase()}] ${mensagem}`;
  const corPorNivel = {
    info: COR.ciano,
    sucesso: COR.verde,
    aviso: COR.amarelo,
    erro: COR.vermelho,
  };
  const cor = corPorNivel[nivel] || COR.reset;
  process.stdout.write(`${cor}${linha}${COR.reset}\n`);

  try {
    await fs.mkdir(LOGS_DIR, { recursive: true });
    await fs.appendFile(LOG_FILE, linha + "\n", "utf8");
  } catch (err) {
    process.stderr.write(`${COR.amarelo}[aviso] Falha ao gravar log: ${err.message}${COR.reset}\n`);
  }
}

// =============================================================================
// Pre-requisitos
// =============================================================================

function checarConexao() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL nao definida. Confira backend/.env (deve conter a string de conexao do Postgres)."
    );
  }
  return url;
}

// No Windows os binarios sao .exe; em Linux/Mac sao apenas o nome.
// Resolvemos uma vez no inicio e cacheamos para os spawns seguintes.
const EH_WINDOWS = process.platform === "win32";
function nomeExecutavel(comando) {
  return EH_WINDOWS ? `${comando}.exe` : comando;
}

// Detecta se pg_dump/psql estao acessiveis. Se nao, instrui a instalacao.
async function checarFerramenta(nome) {
  return new Promise((resolve) => {
    const proc = spawn(nomeExecutavel(nome), ["--version"]);
    let saida = "";
    proc.stdout.on("data", (b) => (saida += b.toString()));
    proc.on("error", () => resolve(null));
    proc.on("close", (code) => resolve(code === 0 ? saida.trim() : null));
  });
}

async function garantirFerramentas(ferramentas) {
  const faltando = [];
  for (const f of ferramentas) {
    const versao = await checarFerramenta(f);
    if (!versao) {
      faltando.push(f);
    } else {
      await log("info", `${f} encontrado: ${versao}`);
    }
  }
  if (faltando.length > 0) {
    await log("erro", `Ferramenta(s) ausente(s) no PATH: ${faltando.join(", ")}`);
    await log(
      "info",
      "Instale o PostgreSQL Client Tools: https://www.postgresql.org/download/windows/ " +
        "(durante a instalacao, marque 'Command Line Tools'). Depois reinicie o terminal."
    );
    throw new Error("Pre-requisito ausente");
  }
}

// =============================================================================
// Helpers de arquivo
// =============================================================================

async function garantirPasta(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function nomeArquivoBackup() {
  // ISO sem caracteres invalidos no Windows (substitui ':' por '-')
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `backup-gestaopro-${ts}.sql`;
}

// Resolve o caminho de um backup informado pelo CLI. Rejeita null bytes e
// nomes relativos que tentem sair de backend/backups (defesa em profundidade
// contra path traversal — alem do shell:false ja garantir sem injecao).
function resolverCaminhoBackup(nomeArquivo) {
  if (nomeArquivo.includes("\0")) {
    throw new Error("Nome de arquivo invalido (null byte)");
  }
  if (path.isAbsolute(nomeArquivo)) {
    return path.normalize(nomeArquivo);
  }
  const resolvido = path.resolve(BACKUPS_DIR, nomeArquivo);
  if (!resolvido.startsWith(BACKUPS_DIR + path.sep) && resolvido !== BACKUPS_DIR) {
    throw new Error(`Nome de arquivo aponta para fora de ${BACKUPS_DIR}: ${nomeArquivo}`);
  }
  return resolvido;
}

async function calcularSha256(caminho) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(caminho);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function formatarTamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

// =============================================================================
// BACKUP
// =============================================================================

async function executarBackup() {
  const url = checarConexao();
  await garantirFerramentas(["pg_dump"]);
  await garantirPasta(BACKUPS_DIR);

  const nome = nomeArquivoBackup();
  const destino = path.join(BACKUPS_DIR, nome);

  await log("info", `Iniciando backup -> ${destino}`);
  const inicio = Date.now();

  // pg_dump aceita a connection string como argumento posicional. Usamos
  // --no-owner e --no-privileges para que o dump seja portavel entre
  // instancias (ex: restaurar em um banco com outro usuario dono).
  // -Fp = formato 'plain' (.sql legivel e restauravel por psql).
  const args = [
    "--no-owner",
    "--no-privileges",
    "--clean",
    "--if-exists",
    "-Fp",
    "-f",
    destino,
    url,
  ];

  await spawnPromise("pg_dump", args, "backup");

  const stat = await fs.stat(destino);
  const sha = await calcularSha256(destino);
  await fs.writeFile(`${destino}.sha256`, `${sha}  ${nome}\n`, "utf8");

  const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
  await log(
    "sucesso",
    `Backup concluido em ${duracao}s — ${formatarTamanho(stat.size)} — sha256=${sha.slice(0, 12)}...`
  );
  await log("info", `Arquivo: ${destino}`);
  await log("info", `Checksum: ${destino}.sha256`);
}

// =============================================================================
// RESTORE
// =============================================================================

async function executarRestore(nomeArquivo, opcoes) {
  if (!nomeArquivo) {
    throw new Error("Nome do arquivo nao informado. Uso: restore <arquivo.sql>");
  }
  const url = checarConexao();
  await garantirFerramentas(["psql"]);

  const caminho = resolverCaminhoBackup(nomeArquivo);

  const { ok, motivo, detalhes } = await verificarIntegridade(caminho);
  if (!ok) {
    await log("erro", `Arquivo invalido: ${motivo}`);
    throw new Error(motivo);
  }

  await log("info", `Arquivo: ${caminho}`);
  await log("info", `Tamanho: ${formatarTamanho(detalhes.tamanho)}`);
  await log("info", `Modificado em: ${detalhes.modificadoEm}`);
  if (detalhes.checksumValidado) {
    await log("sucesso", `Checksum SHA-256 confere com sidecar .sha256`);
  } else if (detalhes.sidecarAusente) {
    await log("aviso", "Sem sidecar .sha256 — integridade nao pode ser comprovada");
  }

  // Confirmacao interativa, a menos que --force tenha sido passado.
  if (!opcoes.force) {
    await log(
      "aviso",
      "Esta operacao IRA SOBRESCREVER todos os dados atuais do banco. Nao ha desfazer."
    );
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const resposta = await rl.question(
      `${COR.amarelo}Digite RESTAURAR (maiusculas) para confirmar: ${COR.reset}`
    );
    rl.close();
    if (resposta.trim() !== "RESTAURAR") {
      await log("info", "Restauracao cancelada pelo usuario");
      return;
    }
  } else {
    await log("aviso", "--force ativo: pulando confirmacao interativa");
  }

  await log("info", "Iniciando restauracao");
  const inicio = Date.now();

  // ON_ERROR_STOP=1 aborta no primeiro erro (do contrario psql continua e o
  // banco fica em estado inconsistente). -v ON_ERROR_STOP=1 e a sintaxe para
  // passar a variavel ao psql.
  const args = [
    "--single-transaction",
    "-v",
    "ON_ERROR_STOP=1",
    "-d",
    url,
    "-f",
    caminho,
  ];

  await spawnPromise("psql", args, "restore");

  const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
  await log("sucesso", `Restauracao concluida em ${duracao}s`);
}

// =============================================================================
// VERIFY (checagem de integridade)
// =============================================================================

async function executarVerify(nomeArquivo) {
  if (!nomeArquivo) {
    throw new Error("Nome do arquivo nao informado. Uso: verify <arquivo.sql>");
  }
  const caminho = resolverCaminhoBackup(nomeArquivo);
  const { ok, motivo, detalhes } = await verificarIntegridade(caminho);
  if (!ok) {
    await log("erro", `Arquivo invalido: ${motivo}`);
    process.exitCode = 1;
    return;
  }
  await log("sucesso", `Arquivo valido — ${formatarTamanho(detalhes.tamanho)}`);
  if (detalhes.checksumValidado) {
    await log("sucesso", `SHA-256 confere com sidecar`);
  } else if (detalhes.sidecarAusente) {
    await log("aviso", "Sem sidecar .sha256 — checksum nao pode ser validado");
  } else {
    await log("erro", "SHA-256 NAO confere com sidecar — arquivo pode estar corrompido");
    process.exitCode = 1;
  }
}

// Checagem de integridade do .sql:
//   1. Arquivo existe e nao esta vazio
//   2. Comeca com cabecalho do pg_dump
//   3. Termina com marcador de conclusao do pg_dump
//   4. Se houver sidecar .sha256, confere o hash
async function verificarIntegridade(caminho) {
  let stat;
  try {
    stat = await fs.stat(caminho);
  } catch {
    return { ok: false, motivo: `Arquivo nao encontrado: ${caminho}` };
  }
  if (stat.size === 0) {
    return { ok: false, motivo: "Arquivo vazio" };
  }

  // Le os primeiros 256 bytes e os ultimos 4 KB para checar marcadores.
  const fd = await fs.open(caminho, "r");
  try {
    const cabecalhoBuf = Buffer.alloc(256);
    await fd.read(cabecalhoBuf, 0, 256, 0);
    const inicio = cabecalhoBuf.toString("utf8");
    if (!inicio.includes(SQL_HEADER)) {
      return {
        ok: false,
        motivo: `Cabecalho '${SQL_HEADER}' nao encontrado. O arquivo foi gerado pelo pg_dump em formato plain?`,
      };
    }

    const tamFim = Math.min(4096, stat.size);
    const rodapeBuf = Buffer.alloc(tamFim);
    await fd.read(rodapeBuf, 0, tamFim, stat.size - tamFim);
    const fim = rodapeBuf.toString("utf8");
    if (!fim.includes(SQL_FOOTER)) {
      return {
        ok: false,
        motivo: `Marcador final '${SQL_FOOTER}' nao encontrado — arquivo provavelmente truncado`,
      };
    }
  } finally {
    await fd.close();
  }

  // Checksum opcional
  const sidecarPath = `${caminho}.sha256`;
  let checksumValidado = false;
  let sidecarAusente = false;
  try {
    const conteudo = await fs.readFile(sidecarPath, "utf8");
    const hashEsperado = conteudo.trim().split(/\s+/)[0];
    const hashCalculado = await calcularSha256(caminho);
    checksumValidado = hashEsperado === hashCalculado;
    if (!checksumValidado) {
      return {
        ok: false,
        motivo: `Hash SHA-256 nao confere (esperado ${hashEsperado.slice(0, 12)}..., calculado ${hashCalculado.slice(0, 12)}...)`,
      };
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      sidecarAusente = true;
    } else {
      return { ok: false, motivo: `Falha ao ler sidecar: ${err.message}` };
    }
  }

  return {
    ok: true,
    detalhes: {
      tamanho: stat.size,
      modificadoEm: stat.mtime.toISOString(),
      checksumValidado,
      sidecarAusente,
    },
  };
}

// =============================================================================
// LIST
// =============================================================================

async function executarList() {
  try {
    const entradas = await fs.readdir(BACKUPS_DIR);
    const arquivos = entradas.filter((e) => e.endsWith(".sql"));
    if (arquivos.length === 0) {
      await log("info", "Nenhum backup encontrado em " + BACKUPS_DIR);
      return;
    }
    const linhas = [];
    for (const arq of arquivos) {
      const full = path.join(BACKUPS_DIR, arq);
      const s = await fs.stat(full);
      const temSidecar = await fs
        .access(`${full}.sha256`)
        .then(() => true)
        .catch(() => false);
      linhas.push({
        arq,
        tamanho: formatarTamanho(s.size),
        modificado: s.mtime.toISOString().slice(0, 19).replace("T", " "),
        sidecar: temSidecar ? "sim" : "nao",
      });
    }
    linhas.sort((a, b) => (a.modificado < b.modificado ? 1 : -1));
    await log("info", `${arquivos.length} backup(s) em ${BACKUPS_DIR}:`);
    for (const l of linhas) {
      process.stdout.write(
        `  ${l.modificado}  ${l.tamanho.padStart(10)}  sha=${l.sidecar}  ${l.arq}\n`
      );
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      await log("info", "Pasta de backups ainda nao existe — rode um backup primeiro");
      return;
    }
    throw err;
  }
}

// =============================================================================
// Spawn helper (pg_dump / psql)
// =============================================================================

// Executa um subprocesso e resolve com a saida ou rejeita com stderr.
// 'rotulo' so e usado para mensagens (ex: 'backup' ou 'restore').
// IMPORTANTE: shell:false evita injecao via nome de arquivo do CLI.
function spawnPromise(comando, args, rotulo) {
  return new Promise((resolve, reject) => {
    const proc = spawn(nomeExecutavel(comando), args, {
      env: { ...process.env },
    });

    let stderr = "";
    proc.stdout.on("data", (b) => process.stdout.write(b));
    proc.stderr.on("data", (b) => {
      const txt = b.toString();
      stderr += txt;
      process.stderr.write(`${COR.cinza}${txt}${COR.reset}`);
    });

    proc.on("error", (err) => {
      reject(new Error(`Falha ao executar ${comando}: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const err = new Error(
          `${comando} retornou codigo ${code} durante ${rotulo}.\n` +
            `stderr:\n${stderr || "(vazio)"}`
        );
        err.exitCode = code;
        reject(err);
      }
    });
  });
}

// =============================================================================
// CLI
// =============================================================================

function parseArgs(argv) {
  const [, , comando, ...resto] = argv;
  const flags = new Set();
  const posicionais = [];
  for (const a of resto) {
    if (a.startsWith("--")) flags.add(a.slice(2));
    else posicionais.push(a);
  }
  return { comando, posicionais, opcoes: { force: flags.has("force") } };
}

function imprimirAjuda() {
  process.stdout.write(`
${COR.ciano}db-manager — CLI de backup/restore PostgreSQL (GestaoPRO)${COR.reset}

Uso:
  node backend/scripts/db-manager.js backup
  node backend/scripts/db-manager.js restore <arquivo.sql> [--force]
  node backend/scripts/db-manager.js verify <arquivo.sql>
  node backend/scripts/db-manager.js list

Comandos:
  backup           Gera dump SQL em backend/backups/ + sidecar .sha256
  restore <arq>    Restaura o banco a partir de <arq>. Pede confirmacao
                   ("RESTAURAR") a menos que --force seja passado.
  verify <arq>     Confere cabecalho, rodape e SHA-256 (se houver sidecar)
  list             Lista backups disponiveis

Flags:
  --force          Pula a confirmacao interativa no restore

Logs: ${LOG_FILE}
`);
}

async function main() {
  const { comando, posicionais, opcoes } = parseArgs(process.argv);
  try {
    switch (comando) {
      case "backup":
        await executarBackup();
        break;
      case "restore":
        await executarRestore(posicionais[0], opcoes);
        break;
      case "verify":
        await executarVerify(posicionais[0]);
        break;
      case "list":
        await executarList();
        break;
      case "--help":
      case "-h":
      case "help":
      case undefined:
        imprimirAjuda();
        break;
      default:
        await log("erro", `Comando desconhecido: ${comando}`);
        imprimirAjuda();
        process.exitCode = 2;
    }
  } catch (err) {
    await log("erro", err.message);
    process.exitCode = 1;
  }
}

main();
